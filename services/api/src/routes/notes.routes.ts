import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import {
  createNote,
  deleteNote,
  getSavedMessageIds,
  listNotes,
} from '../services/notes.service';

const CreateNoteSchema = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
  sourceMessageId: z.string().optional(),
});

export async function notesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const notes = await listNotes(userId);
      return reply.send(
        notes.map((n) => ({
          ...n,
          createdAt: n.createdAt.toISOString(),
          updatedAt: n.updatedAt.toISOString(),
        }))
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/saved-message-ids', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { sessionId } = z
        .object({ sessionId: z.string().min(1) })
        .parse(request.query);
      const ids = await getSavedMessageIds(userId, sessionId);
      return reply.send(ids);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = CreateNoteSchema.parse(request.body);
      const note = await createNote(
        userId,
        body.content,
        body.title,
        body.sourceMessageId
      );
      return reply.code(201).send({
        ...note,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      await deleteNote(userId, id);
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
