import { resolveAssistantContext, normalizePersonalityId, getVoiceProfile } from '@ai-assistant/types';
import type { VoiceTurnAnalytics } from '@ai-assistant/types';
import { prisma } from '@ai-assistant/database';
import { aiClient } from '../lib/ai-client';
import { parseSseBuffer, formatSseFrame } from '../lib/sse';
import { buildAgentTurnInput } from './chat-turn-input';
import { resolveRagEnabled } from './chat.service';
import { getUserPreferredModelId } from './user-model-preference.service';
import { getSessionModelAssignment, persistSessionModelAssignment } from './session-model-context.service';
import { maybeUpdateVoiceSessionSummary } from './voice-summary.service';
import { storeVoiceAnalytics } from './voice-session.service';
import {
  buildAssistantMessageMetadata,
  buildUserMessageMetadata,
  maybeAutoTitleSession,
  persistSessionAssistantContext,
} from './chat.service';

type VoiceTurnStreamParams = {
  userId: string;
  chatSessionId: string;
  text: string;
  confirmed?: boolean;
  timezone?: string;
  voiceProfileId?: string;
  voiceMaxSentences?: number;
  turnId?: string;
  roomId?: string;
  signal?: AbortSignal;
  sttLatencyMs?: number;
};

function buildVoiceAnalytics(params: {
  turnId: string;
  sttLatencyMs: number;
  gatewayLatencyMs: number;
  plannerLatencyMs: number;
  toolLatencyMs: number;
  llmFirstTokenMs: number;
  ttsFirstByteMs: number;
  totalLatencyMs: number;
}): VoiceTurnAnalytics {
  return { ...params };
}

function sumToolLatency(timings: Record<string, number>): number {
  const keys = Object.keys(timings).filter(
    (k) => k.includes('tool') || k === 'plan_tools_ms' || k === 'manifest_ms'
  );
  return keys.reduce((sum, k) => sum + (timings[k] ?? 0), 0);
}

export async function* streamVoiceTurn(
  params: VoiceTurnStreamParams
): AsyncGenerator<string> {
  const turnId = params.turnId ?? `voice-${Date.now()}`;
  const turnStartedAt = Date.now();
  const speechEndAt = turnStartedAt - (params.sttLatencyMs ?? 0);

  let firstSseByteAt: number | undefined;
  let firstTokenAt: number | undefined;
  let accumulated = '';
  let modelUsed: string | undefined;
  let doneTimings: Record<string, number> = {};
  let completedNormally = false;

  const voiceProfile = params.voiceProfileId ? getVoiceProfile(params.voiceProfileId) : undefined;
  const assistantContext = resolveAssistantContext(
    normalizePersonalityId(voiceProfile?.personalityId),
    undefined
  );

  if (params.signal?.aborted) {
    yield formatSseFrame('error', { message: 'Turn aborted' });
    return;
  }

  await prisma.message.create({
    data: {
      chatSessionId: params.chatSessionId,
      role: 'USER',
      content: params.text,
      metadata: buildUserMessageMetadata(assistantContext, []),
    },
  });

  void persistSessionAssistantContext(params.chatSessionId, {
    personalityId: assistantContext.personalityId,
    assistantDisplayName: assistantContext.displayName,
  });

  void maybeAutoTitleSession({
    userId: params.userId,
    sessionId: params.chatSessionId,
    userMessage: params.text,
    assistantMessage: '',
  });

  yield formatSseFrame('user_message_saved', { text: params.text });

  const turnInput = await buildAgentTurnInput({
    userId: params.userId,
    sessionId: params.chatSessionId,
    text: params.text,
    ragEnabled: resolveRagEnabled(true),
    confirmed: params.confirmed ?? false,
    source: 'voice',
    timezone: params.timezone,
    preferredModelId: await getUserPreferredModelId(params.userId),
    modelAssignment: await getSessionModelAssignment(params.chatSessionId),
    voiceProfileId: params.voiceProfileId,
    voiceMaxSentences: params.voiceMaxSentences,
  });

  const stickyModelId = turnInput.sessionModelId;

  let orchRes: Response;
  try {
    orchRes = await aiClient.agent.turn(
      {
        query: turnInput.query,
        routing_query: turnInput.routingQuery ?? turnInput.query.slice(0, 512),
        user_id: turnInput.userId,
        chat_history: turnInput.chatHistory,
        chat_session_id: turnInput.chatSessionId,
        source: 'voice',
        rag_enabled: turnInput.ragEnabled,
        confirmed: turnInput.confirmed,
        attachments: [],
        resolved_attachments: [],
        personality_id: turnInput.personalityId,
        assistant_display_name: turnInput.assistantDisplayName,
        system_prompt: turnInput.systemPrompt,
        file_retrieval_context: turnInput.fileRetrievalContext ?? '',
        session_context: turnInput.sessionContext ?? '',
        timezone: turnInput.timezone,
        preferred_model_id: turnInput.preferredModelId,
        session_model_id: turnInput.sessionModelId,
        voice_profile_id: turnInput.voiceProfileId,
        voice_max_sentences: turnInput.voiceMaxSentences,
      },
      { signal: params.signal }
    );
  } catch (err) {
    if (params.signal?.aborted) {
      yield formatSseFrame('error', { message: 'Turn aborted' });
      return;
    }
    throw err;
  }

  if (!orchRes.ok && orchRes.status !== 428) {
    const errText = await orchRes.text();
    yield formatSseFrame('error', {
      message: errText || `Orchestrator error (${orchRes.status})`,
    });
    return;
  }

  if (!orchRes.body) {
    yield formatSseFrame('error', { message: 'Empty orchestrator response' });
    return;
  }

  const reader = orchRes.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let sseBuffer = '';

  try {
    while (true) {
      if (params.signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        yield formatSseFrame('error', { message: 'Turn aborted' });
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      if (firstSseByteAt === undefined) {
        firstSseByteAt = Date.now();
      }

      sseBuffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseBuffer(sseBuffer);
      sseBuffer = rest;

      for (const ev of events) {
        if (params.signal?.aborted) {
          await reader.cancel().catch(() => undefined);
          yield formatSseFrame('error', { message: 'Turn aborted' });
          return;
        }

        if (ev.event === 'token') {
          try {
            const payload = JSON.parse(ev.data) as { content?: string };
            if (payload.content) {
              if (firstTokenAt === undefined) firstTokenAt = Date.now();
              accumulated += payload.content;
            }
          } catch {
            /* ignore */
          }
        } else if (ev.event === 'done') {
          try {
            const payload = JSON.parse(ev.data) as {
              model?: string;
              timings?: Record<string, number>;
              trace?: Record<string, unknown>;
              voice_metadata?: Record<string, unknown>;
            };

            if (payload.model) modelUsed = payload.model;
            if (payload.timings) doneTimings = payload.timings;

            const gatewayLatencyMs = firstSseByteAt ? firstSseByteAt - turnStartedAt : 0;
            const llmFirstTokenMs = firstTokenAt ? firstTokenAt - turnStartedAt : 0;

            const analytics = buildVoiceAnalytics({
              turnId,
              sttLatencyMs: params.sttLatencyMs ?? 0,
              gatewayLatencyMs,
              plannerLatencyMs: doneTimings.plan_tools_ms ?? 0,
              toolLatencyMs: sumToolLatency(doneTimings),
              llmFirstTokenMs,
              ttsFirstByteMs: 0,
              totalLatencyMs: Date.now() - speechEndAt,
            });

            console.info('[voice-analytics]', JSON.stringify(analytics));

            if (params.roomId) {
              await storeVoiceAnalytics(params.roomId, analytics).catch(() => undefined);
            }

            const augmented = {
              ...payload,
              trace: {
                ...(payload.trace ?? {}),
                voice_analytics: analytics,
              },
              voice_metadata: payload.voice_metadata ?? undefined,
            };

            completedNormally = true;
            yield formatSseFrame('done', augmented);
            continue;
          } catch {
            /* ignore */
          }
        }

        yield `event: ${ev.event}\ndata: ${ev.data}\n\n`;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (params.signal?.aborted) {
    yield formatSseFrame('error', { message: 'Turn aborted' });
    return;
  }

  const trimmed = accumulated.trim();

  if (completedNormally && trimmed) {
    await prisma.message.create({
      data: {
        chatSessionId: params.chatSessionId,
        role: 'ASSISTANT',
        content: trimmed,
        metadata: buildAssistantMessageMetadata(assistantContext),
      },
    });

    await prisma.chatSession.update({
      where: { id: params.chatSessionId },
      data: { updatedAt: new Date() },
    });

    void maybeUpdateVoiceSessionSummary({
      sessionId: params.chatSessionId,
      userId: params.userId,
    });

    void maybeAutoTitleSession({
      userId: params.userId,
      sessionId: params.chatSessionId,
      userMessage: params.text,
      assistantMessage: trimmed,
    });

    yield formatSseFrame('assistant_message_saved', { text: trimmed });
  }

  if (completedNormally && modelUsed && stickyModelId !== modelUsed) {
    await persistSessionModelAssignment(
      params.chatSessionId,
      modelUsed,
      turnInput.modelAssignment?.assignedReason ?? 'fast_chat',
      {
        isFailover: stickyModelId != null && stickyModelId !== modelUsed,
        previousModelId: stickyModelId,
      }
    ).catch(() => undefined);
  }
}
