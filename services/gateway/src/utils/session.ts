import { getSessionFromHeaders } from '@ai-assistant/auth';
import type { IncomingHttpHeaders } from 'http';

export async function getRequestSession(headers: IncomingHttpHeaders) {
  return getSessionFromHeaders(headers);
}

export function headersFromSocketHandshake(
  handshakeHeaders: IncomingHttpHeaders,
  authToken?: string
): IncomingHttpHeaders {
  if (!authToken) {
    return handshakeHeaders;
  }

  const cookieName = 'better-auth.session_token';
  const existing = handshakeHeaders.cookie ?? '';
  const tokenCookie = `${cookieName}=${authToken}`;
  const cookie = existing ? `${existing}; ${tokenCookie}` : tokenCookie;

  return {
    ...handshakeHeaders,
    cookie,
  };
}
