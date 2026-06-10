import Fastify from 'fastify';
import client from 'prom-client';
import { prisma } from '@ai-assistant/database';
import { listAllToolsOpenAi, listToolsForUserOpenAi } from '@ai-assistant/tool-schema';
import { z } from 'zod';
import { startExecution } from './executor';
import { cancelExecution, getExecution } from './execution-store';

const ExecuteSchema = z.object({
  userId: z.string(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  source: z.enum(['chat', 'voice', 'automation', 'workflow', 'manual']),
  confirmed: z.boolean().default(false),
  preview: z.boolean().optional(),
  connectionId: z.string().optional(),
  chatSessionId: z.string().optional(),
});

const PORT = parseInt(
  process.env.TOOL_RUNTIME_PORT ?? process.env.PORT ?? '3011',
  10
);

async function main() {
  const app = Fastify({ logger: true });
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  app.get('/health', async () => ({ status: 'ok', service: 'tool-runtime' }));
  app.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  app.get('/v1/tools/available', async (request) => {
    const userId = (request.query as { userId?: string }).userId;
    if (!userId) {
      return { tools: listAllToolsOpenAi(), connections: [] };
    }

    const connections = await prisma.userConnection.findMany({
      where: { userId, status: 'ACTIVE' },
    });

    const providerIds = connections.map((c) => c.providerId);

    return {
      tools: listToolsForUserOpenAi(providerIds),
      connections: connections.map((c) => ({
        id: c.id,
        providerId: c.providerId,
        metadata: c.metadata,
      })),
    };
  });

  app.post('/v1/executions', async (request, reply) => {
    const body = ExecuteSchema.parse(request.body);
    try {
      const record = await startExecution(body);
      return reply.code(201).send({
        executionId: record.executionId,
        status: record.status,
        tool: record.tool,
        requiresConfirmation: !body.confirmed && !body.preview,
      });
    } catch (err) {
      const e = err as Error & { requiresConfirmation?: boolean };
      return reply.code(e.requiresConfirmation ? 428 : 400).send({
        error: e.message,
        requiresConfirmation: e.requiresConfirmation,
      });
    }
  });

  app.get('/v1/executions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = getExecution(id);
    if (!record) return reply.code(404).send({ error: 'Not found' });
    return {
      executionId: record.executionId,
      status: record.status,
      tool: record.tool,
      result: record.result,
      error: record.error,
      progress: record.progress,
      progressMessage: record.progressMessage,
    };
  });

  app.delete('/v1/executions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = cancelExecution(id);
    if (!ok) return reply.code(400).send({ error: 'Cannot cancel' });
    return { cancelled: true };
  });

  app.get('/v1/executions/:id/stream', async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const interval = setInterval(() => {
      const record = getExecution(id);
      if (!record) {
        reply.raw.write(`data: ${JSON.stringify({ error: 'not found' })}\n\n`);
        clearInterval(interval);
        reply.raw.end();
        return;
      }
      reply.raw.write(
        `data: ${JSON.stringify({
          status: record.status,
          progress: record.progress,
          message: record.progressMessage,
          result: record.result,
          error: record.error,
        })}\n\n`
      );
      if (['completed', 'failed', 'cancelled'].includes(record.status)) {
        clearInterval(interval);
        reply.raw.end();
      }
    }, 500);

    request.raw.on('close', () => clearInterval(interval));
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[tool-runtime] listening on ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
