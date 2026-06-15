import '@ai-assistant/telemetry/register';
import { config } from '@ai-assistant/config';
import { buildApp } from './app';
import { waitForIntelligence } from './lib/wait-for-intelligence';
import { cleanupLegacyConversationMemoryRows } from './services/memory.service';
import { closeAllWorkers } from './workers/queues';

function isLegacyConversationCleanupEnabled(): boolean {
  const raw = (process.env.MEMORY_CLEANUP_CONVERSATION_ROWS ?? 'false').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

async function main() {
  if (isLegacyConversationCleanupEnabled()) {
    await cleanupLegacyConversationMemoryRows().catch((err) => {
      console.warn(
        '[memory] legacy CONVERSATION cleanup failed:',
        err instanceof Error ? err.message : err
      );
    });
  }

  try {
    await waitForIntelligence();
  } catch (err) {
    if (!config.isDev) throw err;
    console.warn(
      '[gateway] Intelligence runtime not ready — starting API anyway (chat/voice may fail until ai-runtime is up):',
      err instanceof Error ? err.message : err
    );
  }

  const app = await buildApp();

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

  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
  app.log.info(`API Gateway listening on http://localhost:${config.apiPort}`);
}

main().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
