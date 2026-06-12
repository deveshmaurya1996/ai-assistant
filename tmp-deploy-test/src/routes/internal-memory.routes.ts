import { FastifyInstance } from 'fastify';
import { listCuratedFacts } from '../services/memory.service';

export async function internalMemoryRoutes(fastify: FastifyInstance) {
  fastify.get('/memory/facts', async (request, reply) => {
    const userId = (request.query as { userId?: string }).userId?.trim();
    const limitRaw = (request.query as { limit?: string }).limit;
    const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || 5, 20) : 5;

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    const facts = await listCuratedFacts(userId, limit);
    return reply.send({
      facts: facts.map((f) => ({
        id: f.id,
        type: f.type,
        content: f.content,
        updatedAt: f.updatedAt.toISOString(),
      })),
    });
  });
}
