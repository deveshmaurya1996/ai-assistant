import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { getAiServiceUrl } from '@ai-assistant/config';

const SpeakSchema = z.object({
  text: z.string().min(1),
});

export async function voiceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.post('/transcribe', async (request, reply) => {
    try {
      requireUserId(request);
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: 'Audio file required' });
      }

      const buffer = await file.toBuffer();
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(buffer)]),
        file.filename ?? 'audio.webm'
      );

      const res = await fetch(getAiServiceUrl('/v1/voice/transcribe'), {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        return reply.code(502).send({ error: 'Transcription failed', details: text });
      }

      return reply.send(await res.json());
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/speak', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { text } = SpeakSchema.parse(request.body);

      const res = await fetch(getAiServiceUrl('/v1/voice/speak'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, user_id: userId }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return reply.code(502).send({ error: 'TTS failed', details: errText });
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer());
      reply.header('Content-Type', 'audio/mpeg');
      return reply.send(audioBuffer);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
