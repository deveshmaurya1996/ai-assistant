import type { FastifyReply } from 'fastify';
import { getRequestSession } from './session';
import { unauthorized } from '../lib/errors';
import { sendError } from '../lib/errors';
import type { AuthenticatedRequest } from '../types/request';

function applySessionTokenFromQuery(
  request: AuthenticatedRequest
): void {
  const token = (request.query as { token?: string } | undefined)?.token;
  if (!token || typeof token !== 'string') return;

  const cookieName = 'better-auth.session_token';
  const existing = request.headers.cookie ?? '';
  const tokenCookie = `${cookieName}=${token}`;
  request.headers.cookie = existing.includes(cookieName)
    ? existing
    : existing
      ? `${existing}; ${tokenCookie}`
      : tokenCookie;
}

export async function authenticateRequest(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    applySessionTokenFromQuery(request);
    const session = await getRequestSession(request.headers);
    if (!session?.user) {
      throw unauthorized();
    }
    request.user = { userId: session.user.id };
  } catch (error) {
    return sendError(reply, error);
  }
}
