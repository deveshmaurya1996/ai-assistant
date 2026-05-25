import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export function createOtlpExporter(): OTLPTraceExporter | undefined {
  if (process.env.OTEL_ENABLED !== 'true') {
    return undefined;
  }

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces';

  const url = endpoint.endsWith('/v1/traces')
    ? endpoint
    : `${endpoint.replace(/\/$/, '')}/v1/traces`;

  return new OTLPTraceExporter({ url });
}

export function getServiceName(fallback: string): string {
  return process.env.OTEL_SERVICE_NAME ?? fallback;
}
