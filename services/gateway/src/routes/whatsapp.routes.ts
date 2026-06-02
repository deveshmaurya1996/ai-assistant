import { FastifyInstance } from 'fastify';
import { sessionManager } from '../whatsapp/session-manager';

export async function whatsappRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => ({ status: 'ok', service: 'whatsapp' }));

  fastify.post('/v1/sessions', async (request, reply) => {
    const { userId, state } = request.body as { userId: string; state: string };
    if (!userId || !state) {
      return reply.code(400).send({ error: 'userId and state are required' });
    }

    const session = await sessionManager.createSession(userId, state);
    return reply.code(201).send({
      sessionId: session.sessionId,
      status: session.status,
    });
  });

  fastify.get('/v1/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    try {
      const session = await sessionManager.getOrRestoreSession(sessionId);
      return {
        sessionId: session.sessionId,
        status: session.status,
        qrData: session.qrData,
        pairingCode: session.pairingCode,
        pairingPhone: session.pairingPhone,
        updatedAt: session.updatedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Session not found';
      return reply.code(404).send({ error: message });
    }
  });

  fastify.post('/v1/sessions/:sessionId/pairing', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { phoneNumber } = request.body as { phoneNumber?: string };
    if (!phoneNumber) {
      return reply.code(400).send({ error: 'phoneNumber is required' });
    }

    try {
      const session = await sessionManager.requestPairingCode(sessionId, phoneNumber);
      return {
        sessionId: session.sessionId,
        pairingCode: session.pairingCode,
        pairingPhone: session.pairingPhone,
        status: session.status,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pairing failed';
      return reply.code(400).send({ error: message });
    }
  });

  fastify.post('/v1/sessions/:sessionId/activate', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = sessionManager.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.status !== 'active') {
      return reply.code(400).send({
        error:
          'WhatsApp is not linked yet. Scan the QR code or enter the pairing code on your phone.',
        status: session.status,
      });
    }
    return { sessionId, status: 'active' };
  });

  fastify.get('/v1/sessions/:sessionId/chats', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const q = (request.query as { q?: string }).q ?? '';
    try {
      const result = await sessionManager.searchChats(sessionId, q);
      return { sessionId, chats: result.chats };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      return reply.code(400).send({ error: message });
    }
  });

  fastify.get('/v1/sessions/:sessionId/unread', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const limit = Number((request.query as { limit?: string }).limit ?? 20);
    try {
      const result = await sessionManager.listUnread(sessionId, limit);
      return { sessionId, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'List unread failed';
      return reply.code(400).send({ error: message });
    }
  });

  fastify.get('/v1/sessions/:sessionId/chats/:chatId/messages', async (request, reply) => {
    const { sessionId, chatId } = request.params as { sessionId: string; chatId: string };
    const limit = Number((request.query as { limit?: string }).limit ?? 25);
    try {
      const result = await sessionManager.readChat(sessionId, decodeURIComponent(chatId), limit);
      return { sessionId, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Read chat failed';
      return reply.code(400).send({ error: message });
    }
  });

  fastify.post('/v1/sessions/:sessionId/send', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { to, message } = request.body as { to: string; message: string };
    if (!to || !message) {
      return reply.code(400).send({ error: 'to and message are required' });
    }

    try {
      const result = await sessionManager.sendMessage(sessionId, to, message);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed';
      const status = message.includes('not active') ? 400 : 502;
      return reply.code(status).send({ error: message });
    }
  });
}
