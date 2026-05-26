import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-token';

export async function registerInternalAuth(app: FastifyInstance) {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.includes('/internal/')) return;

    const header = request.headers['x-internal-token'];
    const token = Array.isArray(header) ? header[0] : header;

    if (token !== TOKEN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });
}

export function internalAuthHeaders(): Record<string, string> {
  return { 'X-Internal-Token': TOKEN };
}
