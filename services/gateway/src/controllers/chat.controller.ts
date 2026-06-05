import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import * as chatService from '../services/chat.service';

const CreateSessionSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  kind: z.enum(['text', 'voice']).optional(),
});

const SessionParamSchema = z.object({
  id: z.string().uuid(),
});

const ListSessionsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  personalityId: z.string().min(1).max(64).optional(),
});

const UpdateSessionSchema = z.object({
  title: z.string().min(1).max(100),
});

export class ChatController {
  static async listSessions(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = requireUserId(request);
      const query = ListSessionsQuerySchema.parse(request.query ?? {});
      return reply.send(
        await chatService.listSessions(userId, {
          cursor: query.cursor,
          limit: query.limit,
          personalityId: query.personalityId,
        })
      );
    } catch (error) {
      return sendError(reply, error);
    }
  }

  static async getSessionMessages(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = requireUserId(request);
      const { id } = SessionParamSchema.parse(request.params);
      return reply.send(await chatService.getSessionMessages(userId, id));
    } catch (error) {
      return sendError(reply, error);
    }
  }

  static async getSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = requireUserId(request);
      const { id } = SessionParamSchema.parse(request.params);
      return reply.send(await chatService.getSession(userId, id));
    } catch (error) {
      return sendError(reply, error);
    }
  }

  static async createSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = requireUserId(request);
      const { title, kind } = CreateSessionSchema.parse(request.body ?? {});
      const session = await chatService.createSession(userId, { title, kind });
      return reply.code(201).send(session);
    } catch (error) {
      return sendError(reply, error);
    }
  }

  static async deleteSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = requireUserId(request);
      const { id } = SessionParamSchema.parse(request.params);
      await chatService.deleteSession(userId, id);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  }

  static async updateSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = requireUserId(request);
      const { id } = SessionParamSchema.parse(request.params);
      const { title } = UpdateSessionSchema.parse(request.body ?? {});
      return reply.send(await chatService.updateSession(userId, id, { title }));
    } catch (error) {
      return sendError(reply, error);
    }
  }

  static async markSessionRead(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = requireUserId(request);
      const { id } = SessionParamSchema.parse(request.params);
      return reply.send(await chatService.markSessionRead(userId, id));
    } catch (error) {
      return sendError(reply, error);
    }
  }
}
