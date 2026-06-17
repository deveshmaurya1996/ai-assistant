import {
  getAssistantPersonality,
  getVoiceProfileForPersonality,
  resolvePersonalityVoiceId,
} from '@ai-assistant/types';
import { resolveProviders } from './providers/registry.js';

export function buildWelcomePhrase(personalityId: string): string {
  const personality = getAssistantPersonality(personalityId);
  return `Hi! I'm ${personality.name}. What can I help you with?`;
}

export async function speakPhrase(params: {
  text: string;
  voiceProfileId: string;
  signal?: AbortSignal;
  publishPcm: (chunk: Buffer) => Promise<void>;
  endPublish?: () => Promise<void>;
  onSpeaking?: () => void | Promise<void>;
  onListening?: () => void | Promise<void>;
}): Promise<void> {
  const trimmed = params.text.trim();
  if (!trimmed || params.signal?.aborted) return;

  const profile = getVoiceProfileForPersonality(params.voiceProfileId);
  const { tts } = resolveProviders(profile);
  const personality = getAssistantPersonality(profile.personalityId);

  const emitFrames = async (source: AsyncIterable<Buffer>) => {
    for await (const frame of source) {
      if (params.signal?.aborted) {
        tts.interrupt();
        break;
      }
      await params.publishPcm(frame);
    }
  };

  await params.onSpeaking?.();
  try {
    await emitFrames(
      tts.synthesizeStream(trimmed, {
        voiceId: resolvePersonalityVoiceId(personality, process.env),
        speakingRate: profile.speakingRate,
      })
    );
    if (!params.signal?.aborted) {
      await params.endPublish?.();
    }
  } finally {
    if (!params.signal?.aborted) {
      await params.onListening?.();
    }
  }
}
