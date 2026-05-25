import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { createOtlpExporter, getServiceName } from './exporters';

let sdk: NodeSDK | undefined;

export function initNodeTelemetry(serviceName = 'ai-assistant-api'): void {
  if (process.env.OTEL_ENABLED !== 'true' || sdk) {
    return;
  }

  const exporter = createOtlpExporter();
  if (!exporter) {
    return;
  }

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: getServiceName(serviceName),
    }),
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  const shutdown = () => {
    sdk?.shutdown().catch(console.error);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
