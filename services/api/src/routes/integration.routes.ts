import { FastifyInstance } from 'fastify';
import { prisma, Prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { getConnector, listConnectors } from '@ai-assistant/integrations';
import { listToolsForConnector } from '@ai-assistant/tool-schema';
import { isFeatureEnabled } from '@ai-assistant/feature-flags';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { encryptCredentials } from '../services/encryption.service';
import { ingestionFetch } from '../lib/runtime-clients';
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

export async function integrationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/providers', async (_request, reply) => {
    const providers = await prisma.integrationProvider.findMany({
      where: { isEnabled: true },
    });
    const connectors = listConnectors().map((c) => ({
      providerId: c.providerId,
      capabilities: c.capabilities,
    }));
    return reply.send({ providers, connectors });
  });

  fastify.get('/connections', async (request, reply) => {
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

  fastify.get('/connections/:id/capabilities', async (request, reply) => {
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

  fastify.post('/:provider/connect', async (request, reply) => {
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

  fastify.get('/connections/:id/whatsapp/session', async (request, reply) => {
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

  fastify.post('/connections/:id/whatsapp/pairing', async (request, reply) => {
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

  fastify.get('/google/callback', async (request, reply) => {
    try {
      const { code, state } = request.query as { code?: string; state?: string };
      if (!code || !state) {
        return reply.code(400).send({ error: 'Missing code or state' });
      }

      const [userId] = state.split(':');
      const connector = getConnector('google');
      if (!connector?.handleCallback) {
        return reply.code(500).send({ error: 'Google connector unavailable' });
      }

      const meta = await connector.handleCallback(userId, { code });
      const credentials =
        (meta as { credentials?: Record<string, unknown> }).credentials ?? meta;

      const connection = await prisma.userConnection.upsert({
        where: { id: `google_${userId}` },
        create: {
          id: `google_${userId}`,
          userId,
          providerId: 'google',
          status: 'ACTIVE',
          encryptedCredentials: encryptCredentials(JSON.stringify(credentials)),
          scopes: meta.scopes ?? [],
        },
        update: {
          status: 'ACTIVE',
          encryptedCredentials: encryptCredentials(JSON.stringify(credentials)),
          scopes: meta.scopes ?? [],
        },
      });

      await markConnectionActive({
        userId,
        connectionId: connection.id,
        providerId: 'google',
      });

      return reply.redirect(
        `${process.env.MOBILE_DEEP_LINK ?? 'aiassistant://'}integrations?connected=google`
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/connections/:id/activate', async (request, reply) => {
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

  fastify.delete('/connections/:id', async (request, reply) => {
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

  fastify.get('/search', async (request, reply) => {
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

  fastify.post('/files/upload', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const data = await request.file();
      if (!data) return reply.code(400).send({ error: 'No file' });

      const buffer = await data.toBuffer();
      const storageKey = `files/${userId}/${Date.now()}_${data.filename}`;

      const asset = await prisma.fileAsset.create({
        data: {
          userId,
          filename: data.filename,
          mimeType: data.mimetype,
          sizeBytes: buffer.length,
          storageKey,
        },
      });

      void ingestionFetch('/v1/files/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, fileAssetId: asset.id }),
      });

      return reply.code(201).send({
        ...asset,
        createdAt: asset.createdAt.toISOString(),
        indexedAt: asset.indexedAt?.toISOString() ?? null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
