import type { FastifyRequest } from 'fastify';

export type AuthenticatedRequest = FastifyRequest & {
  user?: { userId: string };
};
