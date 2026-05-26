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

export async function orchestratorFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = config.aiOrchestratorUrl.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${base}${normalized}`, {
    ...init,
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
  return fetch(`${base}${normalized}`, init);
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
