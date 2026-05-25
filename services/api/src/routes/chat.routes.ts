import { FastifyInstance } from 'fastify';
import { ChatController } from '../controllers/chat.controller';
import { authenticateRequest } from '../utils/auth.middleware';

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/sessions', ChatController.listSessions);
  fastify.post('/sessions', ChatController.createSession);
  fastify.get('/sessions/:id', ChatController.getSession);
  fastify.get('/sessions/:id/messages', ChatController.getSessionMessages);
  fastify.delete('/sessions/:id', ChatController.deleteSession);
}
