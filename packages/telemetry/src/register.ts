import { loadMonorepoEnv } from '@ai-assistant/config';
import { initNodeTelemetry } from './node';

loadMonorepoEnv();
initNodeTelemetry(process.env.OTEL_SERVICE_NAME_API ?? 'ai-assistant-api');
