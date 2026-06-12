import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { tooManyRequests, sendError } from '../lib/errors';
import {
  checkRateLimit,
  getClientIp,
  isRateLimitExemptPath,
  rateLimitMessage,
  resolveHttpRateLimitTiers,
  type RateLimitTier,
} from '../lib/rate-limit';
import { getRequestSession } from '../utils/session';

function isIpTier(tier: RateLimitTier): boolean {
  return tier === 'ip_global' || tier === 'ip_auth';
}

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (isRateLimitExemptPath(pathname)) {
      return;
    }

    const tiers = resolveHttpRateLimitTiers(request.method, request.url);
    if (tiers.length === 0) {
      return;
    }

    const clientIp = getClientIp({
      'x-forwarded-for': request.headers['x-forwarded-for'],
      'x-real-ip': request.headers['x-real-ip'],
    });
    const ipSubject = clientIp === 'unknown' ? request.ip : clientIp;

    for (const tier of tiers) {
      if (!isIpTier(tier)) continue;
      const result = checkRateLimit(ipSubject, tier);
      if (!result.allowed) {
        if (result.retryAfterSec) {
          reply.header('Retry-After', String(result.retryAfterSec));
        }
        return sendError(reply, tooManyRequests(rateLimitMessage(tier)));
      }
    }

    const userTiers = tiers.filter((t) => !isIpTier(t));
    if (userTiers.length === 0) {
      return;
    }

    const session = await getRequestSession(request.headers);
    const userId = session?.user?.id;
    if (!userId) {
      return;
    }

    for (const tier of userTiers) {
      const result = checkRateLimit(userId, tier);
      if (!result.allowed) {
        if (result.retryAfterSec) {
          reply.header('Retry-After', String(result.retryAfterSec));
        }
        return sendError(reply, tooManyRequests(rateLimitMessage(tier)));
      }
    }
  });
}
