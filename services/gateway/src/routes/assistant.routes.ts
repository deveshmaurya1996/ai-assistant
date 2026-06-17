import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AccessToken } from 'livekit-server-sdk';
import {
  ASSISTANT_PERSONALITIES,
  DEFAULT_ASSISTANT_PERSONALITY_ID,
  listVoiceProfilesPublic,
  getVoiceProfileForPersonality,
} from '@ai-assistant/types';
import { config } from '@ai-assistant/config';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { createSession, assertSessionAccess } from '../services/chat.service';
import {
  saveVoiceSession,
  getVoiceSessionByChatSession,
  resolveVoiceRoomId,
} from '../services/voice-session.service';
import {
  loadUserVoiceSettings,
  resolveVoiceProfileId,
} from '../lib/voice-user-settings';
import { dispatchVoiceAgent } from '../lib/livekit-dispatch';
import { aiClient } from '../lib/ai-client';

function liveKitConfigured(): boolean {
  return Boolean(
    config.livekitUrl && config.livekitApiKey && config.livekitApiSecret
  );
}

async function mintLiveKitToken(params: {
  userId: string;
  roomName: string;
}): Promise<{ token: string; expiresAt: string }> {
  const ttlSec = 3600;
  const at = new AccessToken(config.livekitApiKey!, config.livekitApiSecret!, {
    identity: params.userId,
    ttl: ttlSec,
  });
  at.addGrant({
    roomJoin: true,
    room: params.roomName,
    canPublish: true,
    canSubscribe: true,
  });
  const token = await at.toJwt();
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  return { token, expiresAt };
}

export async function assistantRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/voice/profiles', async (_request, reply) => {
    return reply.send({
      profiles: listVoiceProfilesPublic(),
      defaultProfileId: DEFAULT_ASSISTANT_PERSONALITY_ID,
    });
  });

  fastify.get('/personalities', async (_request, reply) => {
    return reply.send({ personalities: ASSISTANT_PERSONALITIES });
  });

  fastify.post('/context/evaluate', async (request, reply) => {
    try {
      requireUserId(request);
      const ContextSchema = z.object({
        foregroundApp: z.string().optional(),
        notificationSummary: z.string().optional(),
        visibleTextSnippet: z.string().optional(),
        clipboardSnippet: z.string().optional(),
      });
      const body = ContextSchema.parse(request.body);
      const urgency =
        body.notificationSummary?.toLowerCase().includes('urgent') === true ? 0.85 : 0.35;
      return reply.send({
        current_context: body.foregroundApp ? `Using ${body.foregroundApp}` : 'general',
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
      const ProactiveScoreSchema = z.object({
        importance: z.number().min(0).max(1).default(0.5),
        userBusy: z.boolean().default(false),
        foregroundApp: z.string().optional(),
        senderPriority: z.number().min(0).max(1).optional(),
      });
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

  fastify.get('/voice/mode', async (_request, reply) => {
    try {
      const payload = await aiClient.voice.mode<{
        mode: string;
        available: string[];
        note?: string;
        future_modes?: string[];
        full_duplex_available?: boolean;
        pollinations_voice?: boolean;
        stt_provider?: string;
        tts_provider?: string;
      }>(undefined);
      return reply.send(payload);
    } catch (err) {
      console.warn('[voice] failed to resolve mode from ai-runtime:', err);
      return reply.send({
        mode: 'unconfigured',
        available: [],
        note: 'AI runtime unavailable; voice mode could not be resolved',
      });
    }
  });

  fastify.post('/voice/live/token', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      if (!liveKitConfigured()) {
        return reply.code(501).send({
          error: 'LiveKit not configured',
          details: 'Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET',
        });
      }

      const body = z
        .object({
          chatSessionId: z.string().optional(),
          personalityId: z.string().optional(),
          voiceProfileId: z.string().optional(),
        })
        .parse(request.body ?? {});

      const userSettings = await loadUserVoiceSettings(userId);
      const voiceProfileId = resolveVoiceProfileId(
        body.voiceProfileId,
        body.personalityId,
        userSettings
      );
      const profile = getVoiceProfileForPersonality(voiceProfileId);

      let chatSessionId = body.chatSessionId;
      let resumed = false;

      if (chatSessionId) {
        await assertSessionAccess(userId, chatSessionId);
        const existing = await getVoiceSessionByChatSession(chatSessionId);
        if (existing) {
          resumed = true;
          const { token, expiresAt } = await mintLiveKitToken({
            userId,
            roomName: existing.roomId,
          });
          await saveVoiceSession({
            ...existing,
            voiceProfileId,
            lastActivityAt: new Date().toISOString(),
          });
          await dispatchVoiceAgent(existing.roomId);
          return reply.send({
            token,
            roomName: existing.roomId,
            chatSessionId,
            livekitUrl: config.livekitUrl,
            voiceProfileId,
            expiresAt,
            resumed: true,
            profile: {
              id: profile.id,
              label: profile.label,
              sttProvider: profile.sttProvider,
              ttsProvider: profile.ttsProvider,
            },
          });
        }
      } else {
        const session = await createSession(userId, { kind: 'voice' });
        chatSessionId = session.id;
      }

      const roomName = resolveVoiceRoomId(chatSessionId!);
      const now = new Date().toISOString();
      await saveVoiceSession({
        roomId: roomName,
        chatSessionId: chatSessionId!,
        userId,
        voiceProfileId,
        activeTurnId: null,
        startedAt: now,
        lastActivityAt: now,
      });

      await dispatchVoiceAgent(roomName);

      const { token, expiresAt } = await mintLiveKitToken({ userId, roomName });

      return reply.send({
        token,
        roomName,
        chatSessionId,
        livekitUrl: config.livekitUrl,
        voiceProfileId,
        expiresAt,
        resumed,
        profile: {
          id: profile.id,
          label: profile.label,
          sttProvider: profile.sttProvider,
          ttsProvider: profile.ttsProvider,
        },
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
