import {
  context,
  propagation,
  trace,
  SpanKind,
  type Context,
} from '@opentelemetry/api';

function toHeaderRecord(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      out[key] = value;
    }
    return out;
  }

  return { ...headers };
}

export function injectTraceHeaders(
  headers: Record<string, string> = {}
): Record<string, string> {
  const carrier: Record<string, string> = { ...headers };
  propagation.inject(context.active(), carrier);
  return carrier;
}

export function injectTraceHeadersFromInit(init?: RequestInit): Record<string, string> {
  return injectTraceHeaders(toHeaderRecord(init?.headers));
}

export function extractTraceContext(
  headers: Record<string, string | string[] | undefined>
): Context {
  const carrier: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      carrier[key.toLowerCase()] = value;
    } else if (Array.isArray(value) && value[0]) {
      carrier[key.toLowerCase()] = value[0];
    }
  }
  return propagation.extract(context.active(), carrier);
}

export function startSpan<T>(
  name: string,
  fn: () => T | Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = trace.getTracer('ai-assistant');
  return tracer.startActiveSpan(
    name,
    { kind: SpanKind.INTERNAL, attributes },
    async (span) => {
      try {
        return await fn();
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    }
  );
}
