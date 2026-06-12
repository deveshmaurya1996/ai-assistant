import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { getAiServiceUrl } from '@ai-assistant/config';

const ImageSchema = z.object({
  prompt: z.string().min(1),
  width: z.number().int().min(256).max(2048).optional(),
  height: z.number().int().min(256).max(2048).optional(),
});

export async function imageRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.post('/generate', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = ImageSchema.parse(request.body);

      const res = await fetch(getAiServiceUrl('/v1/image/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: body.prompt,
          width: body.width ?? 1024,
          height: body.height ?? 1024,
          user_id: userId,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        try {
          const parsed = JSON.parse(text) as {
            error?: string;
            code?: string;
            retryAfterSeconds?: number;
          };
          if (parsed.error) {
            return reply.code(res.status === 503 ? 503 : 502).send(parsed);
          }
        } catch {
          /* plain text body */
        }
        return reply.code(502).send({ error: 'Image generation failed', details: text });
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      reply.header('Content-Type', res.headers.get('content-type') ?? 'image/jpeg');
      return reply.send(buffer);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
