const DEFAULT_BRIDGE_URL = 'http://localhost:3000/internal/whatsapp';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-token';

export function getWhatsAppBridgeUrl(): string {
  return (process.env.WHATSAPP_BRIDGE_URL ?? DEFAULT_BRIDGE_URL).replace(/\/$/, '');
}

export async function whatsappBridgeRequest(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = getWhatsAppBridgeUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${normalized}`;

  try {
    return await fetch(url, {
      ...init,
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
