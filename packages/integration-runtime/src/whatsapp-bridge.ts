function defaultBridgeUrl(): string {
  const publicBase = (
    process.env.API_PUBLIC_URL?.trim() ||
    process.env.GATEWAY_URL?.trim() ||
    ''
  ).replace(/\/$/, '');

  if (publicBase) return `${publicBase}/internal/whatsapp`;

  const port = process.env.API_PORT ?? '3000';
  return `http://localhost:${port}/internal/whatsapp`;
}

const DEFAULT_BRIDGE_URL = defaultBridgeUrl();
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-token';

export function getWhatsAppBridgeUrl(): string {
  return DEFAULT_BRIDGE_URL;
}

export async function whatsappBridgeRequest(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = getWhatsAppBridgeUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${normalized}`;

  const timeoutMs = Number(process.env.WHATSAPP_BRIDGE_TIMEOUT_MS ?? 45_000);

  try {
    return await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': INTERNAL_TOKEN,
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
