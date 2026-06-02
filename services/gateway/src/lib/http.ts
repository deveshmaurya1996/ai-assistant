import { config, getAiServiceUrl } from '@ai-assistant/config';
import { injectTraceHeadersFromInit } from '@ai-assistant/telemetry';
import { AppError } from './errors';

function buildAiHeaders(init?: RequestInit): Record<string, string> {
  const headers = injectTraceHeadersFromInit(init);
  if (!headers['Content-Type'] && !(init?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export async function fetchAi<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = getAiServiceUrl(path);
  const res = await fetch(url, {
    ...init,
    headers: buildAiHeaders(init),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      502,
      `AI service error (${res.status}) [${init?.method ?? 'GET'} ${path}]`,
      body || res.statusText
    );
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }

  return res as unknown as T;
}

export async function streamAi(
  path: string,
  body: unknown
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(getAiServiceUrl(path), {
    method: 'POST',
    headers: buildAiHeaders({
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
    }),
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, `AI stream failed (${res.status}) [POST ${path}]`, text);
  }

  return res.body;
}

export { config };
