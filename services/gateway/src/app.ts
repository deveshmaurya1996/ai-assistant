import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import client from 'prom-client';
import { config } from '@ai-assistant/config';
import { prisma } from '@ai-assistant/database';
import { registerBetterAuth } from './plugins/better-auth';
import { registerRateLimit } from './plugins/rate-limit';
import { registerInternalAuth } from './plugins/internal-auth';
import { chatRoutes } from './routes/chat.routes';
import { agentRoutes } from './routes/agent.routes';
import { memoryRoutes } from './routes/memory.routes';
import { automationRoutes } from './routes/automation.routes';
import { settingsRoutes } from './routes/settings.routes';
import { voiceRoutes } from './routes/voice.routes';
import { assistantRoutes } from './routes/assistant.routes';
import { imageRoutes } from './routes/image.routes';
import { integrationRoutes } from './routes/integration.routes';
import { fileRoutes } from './routes/file.routes';
import { toolRoutes } from './routes/tool.routes';
import { workflowRoutes } from './routes/workflow.routes';
import { reminderRoutes } from './routes/reminder.routes';
import { notesRoutes } from './routes/notes.routes';
import { whatsappRoutes } from './routes/whatsapp.routes';
import { internalIntegrationRoutes } from './routes/internal-integrations.routes';
import { internalMemoryRoutes } from './routes/internal-memory.routes';
import { mobileRoutes } from './routes/mobile.routes';
import { setupSocketIO } from './socket';
import { startAllWorkers } from './workers/queues';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.isDev ? 'info' : 'warn',
    },
  });

  await app.register(multipart);

  await registerRateLimit(app);
  await registerInternalAuth(app);

  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Cookie',
      'Origin',
    ],
  });

  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  app.get('/health', async () => ({ status: 'ok', service: 'api' }));

  app.register(mobileRoutes, { prefix: '/mobile' });

  app.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  app.get('/health/ready', async (_, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'ok' };
    } catch (err) {
      reply.code(503);
      return {
        status: 'degraded',
        database: 'error',
        message: err instanceof Error ? err.message : 'unknown',
      };
    }
  });

  await registerBetterAuth(app);

  app.register(chatRoutes, { prefix: '/chat' });
  app.register(agentRoutes, { prefix: '/agents' });
  app.register(memoryRoutes, { prefix: '/memory' });
  app.register(automationRoutes, { prefix: '/automations' });
  app.register(settingsRoutes, { prefix: '/settings' });
  app.register(voiceRoutes, { prefix: '/voice' });
  app.register(assistantRoutes, { prefix: '/assistant' });
  app.register(imageRoutes, { prefix: '/image' });
  app.register(integrationRoutes, { prefix: '/integrations' });
  app.register(fileRoutes, { prefix: '/files' });
  app.register(toolRoutes, { prefix: '/tools' });
  app.register(workflowRoutes, { prefix: '/workflows' });
  app.register(reminderRoutes, { prefix: '/reminders' });
  app.register(notesRoutes, { prefix: '/notes' });
  app.register(whatsappRoutes, { prefix: '/internal/whatsapp' });
  app.register(internalIntegrationRoutes, { prefix: '/internal' });
  app.register(internalMemoryRoutes, { prefix: '/internal' });

  setupSocketIO(app);
  startAllWorkers();

  return app;
}
