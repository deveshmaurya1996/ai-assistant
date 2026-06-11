import type { FastifyInstance } from 'fastify';
import { bindRequestId, correlationHeaders, resolveRequestId } from '../lib/request-context';

export async function registerRequestId(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    (request as { requestId?: string }).requestId = requestId;
    bindRequestId(requestId);
    reply.header('x-request-id', requestId);
  });

  app.addHook('preHandler', async (request) => {
    const requestId = (request as { requestId?: string }).requestId;
    if (requestId) {
      request.log = request.log.child({ requestId });
    }
  });
}

export { correlationHeaders };
