import { FastifyInstance } from 'fastify';
import { prisma, Prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import {
  getConnector,
  integrationsDeepLink,
  listConnectors,
} from '@ai-assistant/integrations';
import { listToolsForConnector } from '@ai-assistant/tool-schema';
import { buildUserIntegrationManifest } from '../services/integration-manifest.service';
import { isFeatureEnabled } from '@ai-assistant/feature-flags';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { encryptCredentials } from '../services/encryption.service';
import { sessionManager } from '../whatsapp/session-manager';
import { markConnectionActive } from '../whatsapp/connection-lifecycle';
import { randomBytes } from 'crypto';

function resolveWhatsAppBridgeSessionId(metadata: unknown): string | null {
  const meta = (metadata ?? {}) as { bridgeSessionId?: string };
  const id = meta.bridgeSessionId?.trim();
  return id || null;
}

function toPublicSession(session: {
  status: string;
  qrData?: string;
  pairingCode?: string;
  pairingPhone?: string;
  updatedAt: string;
}) {
  return {
    status: session.status,
    qrData: session.qrData,
    pairingCode: session.pairingCode,
    pairingPhone: session.pairingPhone,
    updatedAt: session.updatedAt,
  };
}

function parseOAuthState(state: string): { userId: string; oauthState: string } | null {
  const idx = state.indexOf(':');
  if (idx <= 0) return null;
  const userId = state.slice(0, idx);
  const oauthState = state.slice(idx + 1);
  if (!userId || !oauthState) return null;
  return { userId, oauthState };
}

export async function integrationRoutes(fastify: FastifyInstance) {
  fastify.get('/google/callback', async (request, reply) => {
    try {
      const { code, state, error: oauthError } = request.query as {
        code?: string;
        state?: string;
        error?: string;
      };

      if (oauthError) {
        return reply.redirect(
          integrationsDeepLink({ connected: 'google', error: oauthError })
        );
      }

      if (!code || !state) {
        return reply.code(400).send({ error: 'Missing code or state' });
      }

      const parsed = parseOAuthState(state);
      if (!parsed) {
        return reply.code(400).send({ error: 'Invalid OAuth state' });
      }

      const { userId, oauthState } = parsed;
      const connectionId = `google_${userId}`;

      const pending = await prisma.userConnection.findFirst({
        where: { id: connectionId, userId, providerId: 'google' },
      });
      const storedState = (pending?.metadata as { state?: string } | null)?.state;
      if (!pending || storedState !== oauthState) {
        return reply.code(400).send({ error: 'Invalid or expired OAuth state' });
      }

      const connector = getConnector('google');
      if (!connector?.handleCallback) {
        return reply.code(500).send({ error: 'Google connector unavailable' });
      }

      const meta = await connector.handleCallback(userId, { code });
      const credentials =
        (meta as { credentials?: Record<string, unknown> }).credentials ?? meta;
      const tokenPayload = credentials as { expires_in?: number };
      const expiresAt =
        typeof tokenPayload.expires_in === 'number'
          ? new Date(Date.now() + tokenPayload.expires_in * 1000)
          : undefined;

      const connection = await prisma.userConnection.update({
        where: { id: connectionId },
        data: {
          status: 'ACTIVE',
          encryptedCredentials: encryptCredentials(JSON.stringify(credentials)),
          scopes: meta.scopes ?? [],
          expiresAt,
          metadata: { connectedAt: new Date().toISOString() } as Prisma.InputJsonValue,
        },
      });

      await markConnectionActive({
        userId,
        connectionId: connection.id,
        providerId: 'google',
      });

      return reply.redirect(integrationsDeepLink({ connected: 'google' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OAuth failed';
      return reply.redirect(integrationsDeepLink({ connected: 'google', error: message }));
    }
  });

  await fastify.register(async (authenticated) => {
    authenticated.addHook('preHandler', authenticateRequest);

  authenticated.get('/manifest', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { manifest, plannerText } = await buildUserIntegrationManifest(userId);
      return reply.send({ manifest, plannerText });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  authenticated.get('/providers', async (_request, reply) => {
    const providers = await prisma.integrationProvider.findMany({
      where: { isEnabled: true },
    });
    const connectors = listConnectors().map((c) => ({
      providerId: c.providerId,
      capabilities: c.capabilities,
    }));
    return reply.send({ providers, connectors });
  });

  authenticated.get('/connections', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const connections = await prisma.userConnection.findMany({
        where: { userId },
        include: { provider: true },
        orderBy: { updatedAt: 'desc' },
      });
      return reply.send(
        connections.map((c) => ({
          id: c.id,
          providerId: c.providerId,
          status: c.status,
          scopes: c.scopes,
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          expiresAt: c.expiresAt?.toISOString() ?? null,
          provider: c.provider,
          aiReady: c.status === 'ACTIVE',
        }))
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  authenticated.get('/connections/:id/capabilities', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };

      const connection = await prisma.userConnection.findFirst({
        where: { id, userId },
      });
      if (!connection) return reply.code(404).send({ error: 'Connection not found' });

      const tools =
        connection.status === 'ACTIVE'
          ? listToolsForConnector(connection.providerId).map((t) => t.name)
          : [];

      return reply.send({
        connectionId: connection.id,
        providerId: connection.providerId,
        status: connection.status,
        tools,
        lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  authenticated.post('/:provider/connect', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { provider } = request.params as { provider: string };

      const flagKey = `integrations.${provider}` as 'integrations.google';
      if (!isFeatureEnabled(flagKey, userId)) {
        return reply.code(403).send({ error: 'Integration disabled' });
      }

      const connectionId = `${provider}_${userId}`;

      if (provider === 'whatsapp') {
        const state = randomBytes(16).toString('hex');
        const waSession = await sessionManager.createSession(userId, state);
        const metadata: Record<string, unknown> = {
          state,
          challengeType: 'qr',
          bridgeSessionId: waSession.sessionId,
        };

        const connection = await prisma.userConnection.upsert({
          where: { id: connectionId },
          create: {
            id: connectionId,
            userId,
            providerId: provider,
            status: 'PENDING',
            scopes: [],
            metadata: metadata as Prisma.InputJsonValue,
          },
          update: {
            status: 'PENDING',
            metadata: metadata as Prisma.InputJsonValue,
          },
        });

        return reply.send({
          connectionId: connection.id,
          type: 'qr',
          state: 'pending',
        });
      }

      const connector = getConnector(provider);

      if (!connector?.getConnectUrl) {
        const connection = await prisma.userConnection.upsert({
          where: { id: connectionId },
          create: {
            id: connectionId,
            userId,
            providerId: provider,
            status: 'ACTIVE',
            scopes: [],
          },
          update: { status: 'ACTIVE' },
        });

        await markConnectionActive({
          userId,
          connectionId: connection.id,
          providerId: provider,
        });

        return reply.send({
          connectionId: connection.id,
          type: 'local',
          state: 'ready',
        });
      }

      const state = randomBytes(16).toString('hex');
      const challenge = await connector.getConnectUrl(userId, state);

      const metadata: Record<string, unknown> = {
        state,
        challengeType: challenge.type,
      };
      if (challenge.bridgeSessionId) {
        metadata.bridgeSessionId = challenge.bridgeSessionId;
      }

      const connection = await prisma.userConnection.upsert({
        where: { id: connectionId },
        create: {
          id: connectionId,
          userId,
          providerId: provider,
          status: 'PENDING',
          scopes: [],
          metadata: metadata as Prisma.InputJsonValue,
        },
        update: {
          status: 'PENDING',
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      return reply.send({
        connectionId: connection.id,
        type: challenge.type,
        state: challenge.state ?? 'pending',
        url: challenge.url,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  authenticated.get('/connections/:id/whatsapp/session', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };

      const connection = await prisma.userConnection.findFirst({
        where: { id, userId, providerId: 'whatsapp' },
      });
      if (!connection) return reply.code(404).send({ error: 'Connection not found' });

      const bridgeSessionId = resolveWhatsAppBridgeSessionId(connection.metadata);
      if (!bridgeSessionId) {
        return reply.code(400).send({
          error: 'WhatsApp session expired. Go back and tap Connect again.',
        });
      }

      let session;
      try {
        session = await sessionManager.getOrRestoreSession(bridgeSessionId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Session not found';
        return reply.code(404).send({ error: message });
      }

      if (session.status === 'active' && connection.status !== 'ACTIVE') {
        await markConnectionActive({
          userId,
          connectionId: connection.id,
          providerId: 'whatsapp',
        });
      }

      return reply.send({
        connectionId: id,
        ...toPublicSession(session),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  authenticated.post('/connections/:id/whatsapp/pairing', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const { phoneNumber } = request.body as { phoneNumber?: string };
      if (!phoneNumber) {
        return reply.code(400).send({ error: 'phoneNumber is required' });
      }

      const connection = await prisma.userConnection.findFirst({
        where: { id, userId, providerId: 'whatsapp' },
      });
      if (!connection) return reply.code(404).send({ error: 'Connection not found' });

      const bridgeSessionId = resolveWhatsAppBridgeSessionId(connection.metadata);
      if (!bridgeSessionId) {
        return reply.code(400).send({
          error: 'WhatsApp session expired. Go back and tap Connect again.',
        });
      }

      try {
        const session = await sessionManager.requestPairingCode(
          bridgeSessionId,
          phoneNumber
        );
        return reply.send({
          connectionId: id,
          ...toPublicSession(session),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Pairing failed';
        return reply.code(400).send({ error: message });
      }
    } catch (error) {
      return sendError(reply, error);
    }
  });

  authenticated.post('/connections/:id/activate', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };

      const connection = await prisma.userConnection.findFirst({
        where: { id, userId },
      });
      if (!connection) return reply.code(404).send({ error: 'Not found' });

      if (connection.providerId === 'whatsapp') {
        const bridgeSessionId = resolveWhatsAppBridgeSessionId(connection.metadata);
        if (!bridgeSessionId) {
          return reply.code(400).send({ error: 'WhatsApp session not found' });
        }
        const session = sessionManager.getSession(bridgeSessionId);
        if (!session || session.status !== 'active') {
          return reply.code(400).send({
            error:
              'WhatsApp is not linked yet. Scan the QR code or enter the pairing code on your phone.',
          });
        }
      }

      await markConnectionActive({
        userId,
        connectionId: id,
        providerId: connection.providerId,
      });

      return reply.send({ status: 'ACTIVE' });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  authenticated.delete('/connections/:id', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };

      const connection = await prisma.userConnection.findFirst({
        where: { id, userId },
      });
      if (!connection) return reply.code(404).send({ error: 'Not found' });

      await prisma.userConnection.update({
        where: { id },
        data: { status: 'DISCONNECTED', encryptedCredentials: null },
      });

      await publishEvent(EventNames.INTEGRATION_DISCONNECTED, {
        userId,
        connectionId: id,
        providerId: connection.providerId,
        status: 'disconnected',
      });

      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  authenticated.get('/search', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { q } = request.query as { q?: string };
      if (!q) return reply.send({ results: [] });

      const connections = await prisma.userConnection.findMany({
        where: { userId, status: 'ACTIVE' },
      });

      const results = await prisma.indexedResource.findMany({
        where: {
          connectionId: { in: connections.map((c) => c.id) },
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { snippet: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 20,
      });

      return reply.send({ results });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  });
}
