import '@ai-assistant/config/register';
import { config } from '@ai-assistant/config';
import { buildApp } from './app';
import { stopAutomationWorker } from './workers/automation.worker';

async function main() {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    await stopAutomationWorker();
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
