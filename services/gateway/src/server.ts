import type { FastifyInstance } from 'fastify';
import { config } from '@ai-assistant/config';
import { buildApp } from './app';
import { monitorIntelligenceReadiness } from './lib/intelligence-readiness';
import { cleanupLegacyConversationMemoryRows } from './services/memory.service';
import { closeAllWorkers } from './workers/queues';

function isLegacyConversationCleanupEnabled(): boolean {
  const raw = (process.env.MEMORY_CLEANUP_CONVERSATION_ROWS ?? 'false').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function registerShutdownHandlers(app: FastifyInstance): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down');
    try {
      await closeAllWorkers();
      await app.close();
    } catch (err) {
      app.log.error({ err }, 'Shutdown error');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

export async function startGateway(): Promise<void> {
  if (isLegacyConversationCleanupEnabled()) {
    await cleanupLegacyConversationMemoryRows().catch((err) => {
      console.warn(
        '[memory] legacy CONVERSATION cleanup failed:',
        err instanceof Error ? err.message : err
      );
    });
  }

  const app = await buildApp();
  registerShutdownHandlers(app);

  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
  app.log.info({ port: config.apiPort, host: '0.0.0.0' }, 'API gateway listening');

  monitorIntelligenceReadiness(app.log);
}
