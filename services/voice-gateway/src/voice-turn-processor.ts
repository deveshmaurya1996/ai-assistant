import { loadVoiceSession } from './session-store.js';
import { getVoiceProfileForPersonality, getAssistantPersonality, resolvePersonalityVoiceId } from '@ai-assistant/types';
import { resolveProviders } from './providers/registry.js';
import { streamGatewayTurn } from './turn-client.js';
import { VoiceAnalyticsCollector } from './analytics.js';
import { sentenceChunks } from './status-phrases.js';
import { storeVoiceAnalytics } from './session-store.js';

export async function processVoiceTranscript(params: {
  roomId: string;
  transcript: string;
  sttLatencyMs: number;
  signal?: AbortSignal;
  publishPcm?: (chunk: Buffer) => Promise<void>;
  endPublish?: () => Promise<void>;
  onInterrupt?: () => void;
  onSpeaking?: () => void | Promise<void>;
  onListening?: () => void | Promise<void>;
  onTranscriptUpdate?: (text: string) => void | Promise<void>;
  onMessagesTick?: () => void | Promise<void>;
}): Promise<void> {
  const session = await loadVoiceSession(params.roomId);
  if (!session) {
    throw new Error(`No voice session for room ${params.roomId}`);
  }

  const profile = getVoiceProfileForPersonality(session.voiceProfileId);

  const { tts } = resolveProviders(profile);
  const analytics = new VoiceAnalyticsCollector();
  analytics.markSpeechEnd();

  let tokenBuffer = '';
  let spokenBuffer = '';
  let speakingActive = false;
  const turnId = `turn-${Date.now()}`;

  const pushTranscript = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await params.onTranscriptUpdate?.(trimmed);
  };

  const speak = async (text: string) => {
    if (!text.trim() || params.signal?.aborted) return;
    if (!speakingActive) {
      speakingActive = true;
      await params.onSpeaking?.();
    }
    spokenBuffer = spokenBuffer ? `${spokenBuffer} ${text.trim()}` : text.trim();
    await pushTranscript(spokenBuffer);

    const personality = getAssistantPersonality(profile.personalityId);
    for await (const frame of tts.synthesizeStream(text, {
      voiceId: resolvePersonalityVoiceId(personality, process.env),
      speakingRate: profile.speakingRate,
    })) {
      if (params.signal?.aborted) {
        tts.interrupt();
        params.onInterrupt?.();
        break;
      }
      analytics.markTtsFirstByte();
      if (params.publishPcm) {
        await params.publishPcm(frame);
      }
    }
    if (!params.signal?.aborted) {
      await params.endPublish?.();
    }
  };

  try {
    for await (const ev of streamGatewayTurn({
      userId: session.userId,
      chatSessionId: session.chatSessionId,
      text: params.transcript,
      voiceProfileId: session.voiceProfileId,
      turnId,
      roomId: session.roomId,
      sttLatencyMs: params.sttLatencyMs,
      signal: params.signal,
    })) {
      analytics.markGatewayFirstByte();

      if (ev.event === 'status') {
        continue;
      }

      if (ev.event === 'user_message_saved' || ev.event === 'assistant_message_saved') {
        await params.onMessagesTick?.();
        continue;
      }

      if (ev.event === 'token') {
        try {
          const payload = JSON.parse(ev.data) as { content?: string };
          if (!payload.content) continue;
          analytics.markFirstToken();
          tokenBuffer += payload.content;
          await pushTranscript(
            spokenBuffer
              ? `${spokenBuffer} ${tokenBuffer}`
              : tokenBuffer
          );
          const sentences = sentenceChunks(tokenBuffer);
          if (sentences.length > 1) {
            await speak(sentences.slice(0, -1).join(' '));
            tokenBuffer = sentences[sentences.length - 1] ?? '';
          }
        } catch {
          /* ignore */
        }
        continue;
      }

      if (ev.event === 'action_confirm') {
        await speak('Please confirm. Say yes to proceed.');
        continue;
      }

      if (ev.event === 'done') {
        try {
          const payload = JSON.parse(ev.data) as { timings?: Record<string, number> };
          if (payload.timings) analytics.setDoneTimings(payload.timings);
        } catch {
          /* ignore */
        }
        break;
      }

      if (ev.event === 'error') break;
    }

    if (tokenBuffer.trim() && !params.signal?.aborted) {
      await speak(tokenBuffer.trim());
    }
  } finally {
    if (!params.signal?.aborted) {
      await params.onListening?.();
    }
  }

  const built = analytics.build(turnId, params.sttLatencyMs);
  console.info('[voice-analytics]', JSON.stringify(built));
  await storeVoiceAnalytics(params.roomId, built).catch(() => undefined);
}
