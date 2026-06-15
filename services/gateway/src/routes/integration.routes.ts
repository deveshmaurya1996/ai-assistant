import { FastifyInstance } from 'fastify';
import { prisma, Prisma } from '@ai-assistant/database';
import {
  getConnector,
  integrationsDeepLink,
  listConnectors,
} from '@ai-assistant/integration-runtime';
import { listToolsForConnector } from '@ai-assistant/tool-schema';
import { buildUserIntegrationManifest } from '../services/integration-manifest.service';
import { isFeatureEnabled } from '@ai-assistant/feature-flags';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import {
  decryptCredentials,
  encryptCredentials,
} from '../services/encryption.service';
import { sessionManager } from '../whatsapp/session-manager';
import { toPublicWhatsAppSession } from '../whatsapp/pairing-public';
import { findLatestActiveBridgeSession } from '../whatsapp/session-resolve';
import { formatPhoneForDisplay } from '../whatsapp/phone-normalize';
import {
  markConnectionActive,
  markConnectionDisconnected,
} from '../whatsapp/connection-lifecycle';
import { assessConnectionsHealth } from '../services/integration-health.service';
import { ensureIntegrationProvider } from '../services/ensure-integration-provider.service';
import { randomBytes } from 'crypto';

function resolveWhatsAppBridgeSessionId(metadata: unknown): string | null {
  const meta = (metadata ?? {}) as { bridgeSessionId?: string };
  const id = meta.bridgeSessionId?.trim();
  return id || null;
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
      const health = await assessConnectionsHealth(
        userId,
        connections.map((c) => ({
          id: c.id,
          providerId: c.providerId,
          status: c.status,
        }))
      );

      return reply.send(
        connections.map((c) => {
          const healthResult = health.get(c.id);
          const runtimeHealthy = healthResult?.healthy === true;
          return {
            id: c.id,
            providerId: c.providerId,
            status: c.status,
            scopes: c.scopes,
            lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
            expiresAt: c.expiresAt?.toISOString() ?? null,
            provider: c.provider,
            runtimeHealthy,
            aiReady: c.status === 'ACTIVE' && runtimeHealthy,
            healthError:
              c.status === 'ACTIVE' && !runtimeHealthy && healthResult?.error
                ? healthResult.error
                : null,
          };
        })
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

      await ensureIntegrationProvider(provider);

      if (provider === 'whatsapp') {
        const existing = await prisma.userConnection.findUnique({
          where: { id: connectionId },
        });
        const oldBridge = existing
          ? resolveWhatsAppBridgeSessionId(existing.metadata)
          : null;

        if (existing?.status === 'PENDING' && oldBridge) {
          try {
            const resumed = await sessionManager.getLinkingSessionState(oldBridge);
            if (resumed.status === 'pending') {
              return reply.send({
                connectionId: existing.id,
                type: 'qr',
                state: 'pending',
              });
            }
            if (resumed.status === 'active') {
              await markConnectionActive({
                userId,
                connectionId: existing.id,
                providerId: 'whatsapp',
              });
              return reply.send({
                connectionId: existing.id,
                type: 'qr',
                state: 'ready',
              });
            }
          } catch {
            if (oldBridge) {
              await sessionManager.disconnectSession(oldBridge).catch(() => undefined);
            }
          }
        } else {
          const restoredBridge = await findLatestActiveBridgeSession(userId);
          if (restoredBridge) {
            const state = randomBytes(16).toString('hex');
            const metadata: Record<string, unknown> = {
              state,
              challengeType: 'qr',
              bridgeSessionId: restoredBridge,
            };
            const connection = await prisma.userConnection.upsert({
              where: { id: connectionId },
              create: {
                id: connectionId,
                userId,
                providerId: provider,
                status: 'ACTIVE',
                scopes: [],
                metadata: metadata as Prisma.InputJsonValue,
              },
              update: {
                status: 'ACTIVE',
                metadata: metadata as Prisma.InputJsonValue,
              },
            });
            await markConnectionActive({
              userId,
              connectionId: connection.id,
              providerId: 'whatsapp',
            });
            return reply.send({
              connectionId: connection.id,
              type: 'qr',
              state: 'ready',
            });
          }

          if (oldBridge) {
            await sessionManager.disconnectSession(oldBridge).catch(() => undefined);
          }
        }

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

      const [user, existingConnection] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
        prisma.userConnection.findUnique({ where: { id: connectionId } }),
      ]);

      let hasRefreshToken = false;
      if (existingConnection?.encryptedCredentials) {
        try {
          const raw = decryptCredentials(existingConnection.encryptedCredentials);
          const creds = JSON.parse(raw) as { refresh_token?: string };
          hasRefreshToken = Boolean(creds.refresh_token);
        } catch {
          hasRefreshToken = false;
        }
      }

      const challenge = await connector.getConnectUrl(userId, state, {
        loginHint: user?.email,
        hasRefreshToken,
      });

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
        session =
          connection.status === 'PENDING'
            ? await sessionManager.getLinkingSessionState(bridgeSessionId)
            : await sessionManager.getOrRestoreSession(bridgeSessionId);
      } catch (err) {
        if (connection.status === 'PENDING') {
          try {
            session = await sessionManager.restartPendingSession(bridgeSessionId);
          } catch (restartErr) {
            const message =
              restartErr instanceof Error ? restartErr.message : 'Session not found';
            return reply.code(404).send({
              error:
                message === 'Session not found'
                  ? 'WhatsApp session expired. Go back and tap Connect again.'
                  : message,
            });
          }
        } else {
          const message = err instanceof Error ? err.message : 'Session not found';
          return reply.code(404).send({ error: message });
        }
      }

      if (session.status === 'active' && connection.status !== 'ACTIVE') {
        await markConnectionActive({
          userId,
          connectionId: connection.id,
          providerId: 'whatsapp',
        });
      }

      const connectionPhase = sessionManager.getConnectionPhase(bridgeSessionId);

      return reply.send({
        connectionId: id,
        ...toPublicWhatsAppSession(session, {
          connectionPhase,
          pairingReconnecting: sessionManager.isReconnecting(bridgeSessionId),
        }),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  authenticated.post('/connections/:id/whatsapp/pairing', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const body = request.body as {
        phoneNumber?: string | number;
        countryCode?: string;
        forceRefresh?: boolean;
      };
      const rawPhone = body.phoneNumber;
      if (rawPhone === undefined || rawPhone === null || String(rawPhone).trim() === '') {
        return reply.code(400).send({ error: 'phoneNumber is required' });
      }

      const phoneNumber = String(rawPhone).trim();
      const countryCode = body.countryCode?.trim();
      const forceRefresh = body.forceRefresh === true;

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

      const requestPairing = () =>
        sessionManager.requestPairingCode(bridgeSessionId, phoneNumber, {
          countryCode,
          forceRefresh,
        });

      const sendPairingResponse = (session: Awaited<ReturnType<typeof requestPairing>>) => {
        const connectionPhase = sessionManager.getConnectionPhase(bridgeSessionId);
        return reply.send({
          connectionId: id,
          ...toPublicWhatsAppSession(session, {
            connectionPhase,
            pairingReconnecting: sessionManager.isReconnecting(bridgeSessionId),
          }),
          pairingPhoneDisplay: session.pairingPhone
            ? formatPhoneForDisplay(session.pairingPhone)
            : undefined,
        });
      };

      try {
        const session = await requestPairing();
        return sendPairingResponse(session);
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
        let session;
        try {
          session = await sessionManager.getOrRestoreSession(bridgeSessionId);
        } catch {
          return reply.code(400).send({
            error:
              'WhatsApp is not linked yet. Scan the QR code or enter the pairing code on your phone.',
          });
        }
        if (session.status !== 'active') {
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

      if (connection.providerId === 'whatsapp') {
        const bridgeSessionId = resolveWhatsAppBridgeSessionId(connection.metadata);
        if (bridgeSessionId) {
          await sessionManager.disconnectSession(bridgeSessionId).catch(() => undefined);
        }
      }

      await markConnectionDisconnected({
        userId,
        connectionId: id,
        providerId: connection.providerId,
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
