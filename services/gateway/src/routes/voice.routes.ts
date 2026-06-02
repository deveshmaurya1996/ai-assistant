import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAiServiceUrl } from '@ai-assistant/config';
import { injectTraceHeadersFromInit } from '@ai-assistant/telemetry';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { fetchAi } from '../lib/http';
const SpeakSchema = z.object({
  text: z.string().min(1),
  voice: z.string().optional(),
});

export async function voiceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.post('/transcribe', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: 'Audio file required' });
      }

      const buffer = await file.toBuffer();
      const filename = file.filename ?? 'recording.webm';
      const mimeType = file.mimetype ?? 'application/octet-stream';
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(buffer)], { type: mimeType }),
        filename
      );

      const data = await fetchAi<{ text: string }>('/v1/voice/transcribe', {
        method: 'POST',
        body: form,
      });

      await publishEvent(EventNames.VOICE_STREAM, {
        userId,
        bytes: buffer.length,
      }).catch(() => undefined);

      return reply.send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/speak', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { text, voice } = SpeakSchema.parse(request.body);

      const res = await fetch(getAiServiceUrl('/v1/voice/speak'), {
        method: 'POST',
        headers: injectTraceHeadersFromInit({
          headers: { 'Content-Type': 'application/json' },
        }),
        body: JSON.stringify({ text, user_id: userId, voice }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return reply.code(502).send({ error: 'TTS failed', details: errText });
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer());

      await publishEvent(EventNames.VOICE_STREAM, {
        userId,
        bytes: audioBuffer.length,
      }).catch(() => undefined);

      reply.header('Content-Type', 'audio/mpeg');
      return reply.send(audioBuffer);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
