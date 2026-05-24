import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from '@ai-assistant/config';
import { prisma } from '@ai-assistant/database';
import { registerBetterAuth } from './plugins/better-auth';
import { chatRoutes } from './routes/chat.routes';
import { agentRoutes } from './routes/agent.routes';
import { memoryRoutes } from './routes/memory.routes';
import { automationRoutes } from './routes/automation.routes';
import { settingsRoutes } from './routes/settings.routes';
import { voiceRoutes } from './routes/voice.routes';
import { imageRoutes } from './routes/image.routes';
import { setupSocketIO } from './socket';
import { startAutomationWorker } from './workers/automation.worker';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.isDev ? 'info' : 'warn',
    },
  });

  await app.register(multipart);

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

  app.get('/health', async () => ({ status: 'ok', service: 'api' }));

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
  app.register(imageRoutes, { prefix: '/image' });

  setupSocketIO(app);
  startAutomationWorker();

  return app;
}
