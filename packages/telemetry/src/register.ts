import '@ai-assistant/config/register';
import { initNodeTelemetry } from './node';

initNodeTelemetry(process.env.OTEL_SERVICE_NAME_API ?? 'ai-assistant-api');
