import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'http';
import { auth } from './index';

export async function getSessionFromHeaders(headers: IncomingHttpHeaders) {
  return auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
}
