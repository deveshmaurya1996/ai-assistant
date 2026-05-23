import type { FastifyReply } from 'fastify';
import { getRequestSession } from './session';
import { unauthorized } from '../lib/errors';
import { sendError } from '../lib/errors';
import type { AuthenticatedRequest } from '../types/request';

export async function authenticateRequest(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const session = await getRequestSession(request.headers);
    if (!session?.user) {
      throw unauthorized();
    }
    request.user = { userId: session.user.id };
  } catch (error) {
    return sendError(reply, error);
  }
}
