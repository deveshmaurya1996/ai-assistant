import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { streamVoiceTurn } from '../services/voice-turn.service';
import {
  getVoiceSessionByRoom,
  setActiveVoiceTurn,
} from '../services/voice-session.service';
import {
  abortChatTurnBySession,
  beginChatTurn,
  endChatTurn,
} from '../services/chat-turn-registry';
import {
  loadUserVoiceSettings,
  resolveVoiceMaxSentences,
  resolveVoiceProfileId,
} from '../lib/voice-user-settings';

const TurnBodySchema = z.object({
  userId: z.string().min(1),
  chatSessionId: z.string().min(1),
  text: z.string().min(1),
  confirmed: z.boolean().optional(),
  timezone: z.string().optional(),
  personalityId: z.string().optional(),
  voiceProfileId: z.string().optional(),
  turnId: z.string().optional(),
  roomId: z.string().optional(),
  sttLatencyMs: z.number().optional(),
});

const AbortBodySchema = z.object({
  chatSessionId: z.string().min(1),
});

export async function internalVoiceRoutes(fastify: FastifyInstance) {
  fastify.post('/voice/turn', async (request, reply) => {
    const body = TurnBodySchema.parse(request.body ?? {});
    const userSettings = await loadUserVoiceSettings(body.userId);
    const voiceProfileId = resolveVoiceProfileId(
      body.voiceProfileId,
      body.personalityId,
      userSettings
    );
    const voiceMaxSentences = resolveVoiceMaxSentences(voiceProfileId, userSettings);

    const controller = beginChatTurn('voice-gateway', body.chatSessionId);
    if (body.roomId) {
      await setActiveVoiceTurn(body.roomId, body.turnId ?? null);
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      for await (const frame of streamVoiceTurn({
        userId: body.userId,
        chatSessionId: body.chatSessionId,
        text: body.text,
        confirmed: body.confirmed,
        timezone: body.timezone,
        voiceProfileId,
        voiceMaxSentences,
        turnId: body.turnId,
        roomId: body.roomId,
        sttLatencyMs: body.sttLatencyMs,
        signal: controller.signal,
      })) {
        reply.raw.write(frame);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Voice turn failed';
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    } finally {
      endChatTurn('voice-gateway', body.chatSessionId);
      if (body.roomId) {
        await setActiveVoiceTurn(body.roomId, null).catch(() => undefined);
      }
      reply.raw.end();
    }
  });

  fastify.post('/voice/turn/abort', async (request, reply) => {
    const body = AbortBodySchema.parse(request.body ?? {});
    const aborted = abortChatTurnBySession(body.chatSessionId);
    return reply.send({ aborted });
  });

  fastify.get('/voice/sessions/:roomId', async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const session = await getVoiceSessionByRoom(roomId);
    if (!session) {
      return reply.code(404).send({ error: 'Voice session not found' });
    }
    return reply.send(session);
  });
}
