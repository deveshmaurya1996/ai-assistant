import { config } from '@ai-assistant/config';

export async function toolRuntimeFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = config.toolRuntimeUrl.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${base}${normalized}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

export async function skillRuntimeFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = config.skillRuntimeUrl.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${base}${normalized}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

export async function orchestratorFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = config.cognitiveRuntimeUrl.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const timeoutMs = Number(process.env.ORCHESTRATOR_TIMEOUT_MS ?? 30_000);
  const signal =
    init?.signal ??
    (typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined);
  return fetch(`${base}${normalized}`, {
    ...init,
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

export async function ingestionFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = config.ingestionEngineUrl.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${normalized}`;

  try {
    return await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new Error(
      `Ingestion service is not reachable at ${base}. Start ingestion-engine or set INGESTION_ENGINE_URL.`,
      { cause }
    );
  }
}

export function enqueueIngestionJob(
  path: string,
  body?: Record<string, unknown>,
  logLabel = 'ingestion'
): void {
  void ingestionFetch(path, {
    method: 'POST',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[${logLabel}] enqueue failed (${config.ingestionEngineUrl}): ${message}`
    );
  });
}

export async function whatsappBridgeFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = config.whatsappBridgeUrl.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${normalized}`;

  try {
    return await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      body:
        init?.body ??
        (init?.method === 'POST' || init?.method === 'PUT' || init?.method === 'PATCH'
          ? '{}'
          : undefined),
    });
  } catch (cause) {
    throw new Error(
      `WhatsApp service is not reachable at ${base}. Ensure the API is running.`,
      { cause }
    );
  }
}
