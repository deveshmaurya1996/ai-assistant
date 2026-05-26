import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { toolRuntimeFetch } from '../lib/runtime-clients';

const ExecuteSchema = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  source: z.enum(['chat', 'voice', 'automation', 'workflow', 'manual']).default('chat'),
  confirmed: z.boolean().default(false),
  preview: z.boolean().optional(),
  connectionId: z.string().optional(),
  chatSessionId: z.string().optional(),
});

export async function toolRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/available', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const res = await toolRuntimeFetch(
        `/v1/tools/available?userId=${encodeURIComponent(userId)}`
      );
      const data = await res.json();
      return reply.send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/execute', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = ExecuteSchema.parse(request.body);

      const res = await toolRuntimeFetch('/v1/executions', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          tool: body.tool,
          args: body.args,
          source: body.source,
          confirmed: body.confirmed,
          preview: body.preview,
          connectionId: body.connectionId,
          chatSessionId: body.chatSessionId,
        }),
      });

      const data = await res.json();
      if (res.status === 428) {
        return reply.code(428).send(data);
      }
      if (!res.ok) {
        return reply.code(res.status).send(data);
      }
      return reply.code(201).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/executions/:id', async (request, reply) => {
    try {
      requireUserId(request);
      const { id } = request.params as { id: string };
      const res = await toolRuntimeFetch(`/v1/executions/${id}`);
      const data = await res.json();
      return reply.code(res.status).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/executions/:id', async (request, reply) => {
    try {
      requireUserId(request);
      const { id } = request.params as { id: string };
      const res = await toolRuntimeFetch(`/v1/executions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      return reply.code(res.status).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
