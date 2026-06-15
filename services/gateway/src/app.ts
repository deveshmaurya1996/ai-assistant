import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import client from 'prom-client';
import { config } from '@ai-assistant/config';
import { registerBetterAuth } from './plugins/better-auth';
import { registerRateLimit } from './plugins/rate-limit';
import { registerInternalAuth } from './plugins/internal-auth';
import { registerRequestId } from './plugins/request-id.plugin';
import { registerIntelligenceProxy } from './plugins/intelligence-proxy.plugin';
import { registerToolRuntimePlugin } from './plugins/tool-runtime.plugin';
import { registerCapabilityRuntimePlugin } from './plugins/capability-runtime.plugin';
import { healthRoutes } from './routes/health.routes';
import { internalIngestionRoutes } from './routes/internal-ingestion.routes';
import { chatRoutes } from './routes/chat.routes';
import { agentRoutes } from './routes/agent.routes';
import { memoryRoutes } from './routes/memory.routes';
import { automationRoutes } from './routes/automation.routes';
import { settingsRoutes } from './routes/settings.routes';
import { adminModelRoutes } from './routes/admin-model.routes';
import { voiceRoutes } from './routes/voice.routes';
import { assistantRoutes } from './routes/assistant.routes';
import { imageRoutes } from './routes/image.routes';
import { integrationRoutes } from './routes/integration.routes';
import { fileRoutes } from './routes/file.routes';
import { toolRoutes } from './routes/tool.routes';
import { workflowRoutes } from './routes/workflow.routes';
import { reminderRoutes } from './routes/reminder.routes';
import { deviceRoutes } from './routes/device.routes';
import { internalReminderRoutes } from './routes/internal-reminder.routes';
import { internalAutomationRoutes } from './routes/internal-automation.routes';
import { notesRoutes } from './routes/notes.routes';
import { whatsappRoutes } from './routes/whatsapp.routes';
import { internalIntegrationRoutes } from './routes/internal-integrations.routes';
import { internalMemoryRoutes } from './routes/internal-memory.routes';
import { mobileRoutes } from './routes/mobile.routes';
import { setupSocketIO } from './socket';
import { startAllWorkers } from './workers/queues';
import { logProductionReadiness } from './lib/production-readiness';
import { bootstrapIntegrationProviders } from './services/ensure-integration-provider.service';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.isDev ? 'info' : 'warn',
    },
  });

  await app.register(multipart);

  await registerRequestId(app);
  await registerRateLimit(app);
  await registerInternalAuth(app);
  await registerIntelligenceProxy(app);

  await app.register(registerToolRuntimePlugin, { prefix: '/internal/tools' });
  await app.register(registerCapabilityRuntimePlugin, { prefix: '/internal/capabilities' });

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

  await app.register(healthRoutes);

  app.register(mobileRoutes, { prefix: '/mobile' });

  app.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  await registerBetterAuth(app);

  app.register(chatRoutes, { prefix: '/chat' });
  app.register(agentRoutes, { prefix: '/agents' });
  app.register(memoryRoutes, { prefix: '/memory' });
  app.register(automationRoutes, { prefix: '/automations' });
  app.register(settingsRoutes, { prefix: '/settings' });
  app.register(adminModelRoutes, { prefix: '/admin' });
  app.register(voiceRoutes, { prefix: '/voice' });
  app.register(assistantRoutes, { prefix: '/assistant' });
  app.register(imageRoutes, { prefix: '/image' });
  app.register(integrationRoutes, { prefix: '/integrations' });
  app.register(fileRoutes, { prefix: '/files' });
  app.register(toolRoutes, { prefix: '/tools' });
  app.register(workflowRoutes, { prefix: '/workflows' });
  app.register(reminderRoutes, { prefix: '/reminders' });
  app.register(deviceRoutes, { prefix: '/devices' });
  app.register(internalReminderRoutes, { prefix: '/internal' });
  app.register(internalAutomationRoutes, { prefix: '/internal' });
  app.register(notesRoutes, { prefix: '/notes' });
  app.register(whatsappRoutes, { prefix: '/internal/whatsapp' });
  app.register(internalIntegrationRoutes, { prefix: '/internal' });
  app.register(internalMemoryRoutes, { prefix: '/internal' });
  app.register(internalIngestionRoutes, { prefix: '/internal' });

  setupSocketIO(app);
  startAllWorkers();
  void logProductionReadiness(app.log);

  void bootstrapIntegrationProviders().catch((err) => {
    app.log.warn({ err }, 'Integration provider bootstrap failed');
  });

  void import('./whatsapp/session-bootstrap.js').then(({ bootstrapWhatsAppSessions }) =>
    bootstrapWhatsAppSessions()
  );

  return app;
}
