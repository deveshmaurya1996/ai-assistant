import '@ai-assistant/telemetry/register';
import { startGateway } from './server';

startGateway().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
