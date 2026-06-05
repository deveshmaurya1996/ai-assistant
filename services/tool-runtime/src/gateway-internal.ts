import { config } from '@ai-assistant/config';

const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-token';

function gatewayBase(): string {
  return config.gatewayUrl.replace(/\/$/, '');
}

export async function gatewayInternalFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${gatewayBase()}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': INTERNAL_TOKEN,
      ...(init?.headers ?? {}),
    },
  });
}
