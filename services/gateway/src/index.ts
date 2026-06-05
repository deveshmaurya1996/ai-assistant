import '@ai-assistant/telemetry/register';
import { config } from '@ai-assistant/config';
import { buildApp } from './app';
import { cleanupLegacyConversationMemoryRows } from './services/memory.service';

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

  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
  app.log.info(`API Gateway listening on http://localhost:${config.apiPort}`);
}

main().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
