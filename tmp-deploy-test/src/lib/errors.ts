import { FastifyReply } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function unauthorized(message = 'Unauthorized'): AppError {
  return new AppError(401, message);
}

export function forbidden(message = 'Forbidden'): AppError {
  return new AppError(403, message);
}

export function notFound(message = 'Not found'): AppError {
  return new AppError(404, message);
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, message, details);
}

export function tooManyRequests(message = 'Too many requests'): AppError {
  return new AppError(429, message);
}

export function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      error: error.message,
      details: error.details,
    });
  }

  if (error instanceof ZodError) {
    return reply.code(400).send({ error: 'Validation failed', details: error.issues });
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  reply.log.error({ err: error }, 'Unhandled route error');
  return reply.code(500).send({ error: message });
}
