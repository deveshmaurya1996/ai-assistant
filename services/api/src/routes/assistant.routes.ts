import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { fetchAi } from '../lib/http';

const ContextSchema = z.object({
  foregroundApp: z.string().optional(),
  notificationSummary: z.string().optional(),
  visibleTextSnippet: z.string().optional(),
  clipboardSnippet: z.string().optional(),
});

const ProactiveScoreSchema = z.object({
  importance: z.number().min(0).max(1).default(0.5),
  userBusy: z.boolean().default(false),
  foregroundApp: z.string().optional(),
  senderPriority: z.number().min(0).max(1).optional(),
});

export const PERSONALITY_PRESETS = [
  { id: 'assistant', name: 'Assistant', voice: 'neutral', tone: 'helpful' },
  { id: 'friday', name: 'Friday', voice: 'female_soft', tone: 'friendly_professional' },
  { id: 'jarvis', name: 'Jarvis', voice: 'male_crisp', tone: 'concise' },
] as const;

export async function assistantRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/personalities', async (_request, reply) => {
    return reply.send({ personalities: PERSONALITY_PRESETS });
  });

  fastify.post('/context/evaluate', async (request, reply) => {
    try {
      requireUserId(request);
      const body = ContextSchema.parse(request.body);
      const urgency =
        body.notificationSummary?.toLowerCase().includes('urgent') === true ? 0.85 : 0.35;
      return reply.send({
        current_context: body.foregroundApp
          ? `Using ${body.foregroundApp}`
          : 'general',
        urgency,
        user_state: body.visibleTextSnippet ? 'focused' : 'idle',
        recommended_behavior: urgency > 0.7 ? 'overlay_only' : 'wait',
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/proactive/score', async (request, reply) => {
    try {
      requireUserId(request);
      const body = ProactiveScoreSchema.parse(request.body);
      const score =
        body.importance * 0.5 +
        (body.senderPriority ?? 0.3) * 0.3 +
        (body.userBusy ? 0 : 0.2);
      let action: 'voice_interrupt' | 'overlay_only' | 'defer_summary' = 'defer_summary';
      if (score > 0.75 && !body.userBusy) action = 'voice_interrupt';
      else if (score > 0.45) action = 'overlay_only';
      return reply.send({ score, action });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/voice/mode', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const data = await fetchAi<{ mode: string; available: string[] }>(
        `/v1/voice/mode?user_id=${encodeURIComponent(userId)}`
      );
      return reply.send(data);
    } catch (error) {
      return reply.send({
        mode: 'classic',
        available: ['classic'],
        note: 'AI service unavailable; using classic pipeline',
      });
    }
  });

  fastify.post('/voice/live/token', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = z
        .object({ provider: z.enum(['gemini-live', 'openai-realtime']).optional() })
        .parse(request.body ?? {});

      const data = await fetchAi<{ token: string; expiresAt: string; provider: string }>(
        '/v1/voice/live/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, provider: body.provider }),
        }
      );
      return reply.send(data);
    } catch (error) {
      return reply.code(501).send({
        error: 'Live voice not configured',
        details:
          'Set GEMINI_API_KEY or OPENAI_API_KEY and enable VOICE_MODE=gemini-live or openai-realtime',
      });
    }
  });
}
