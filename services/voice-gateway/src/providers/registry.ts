import type { VoiceProfile } from '@ai-assistant/types';
import type { SpeechProvider, TTSProvider } from './types.js';
import { createLocalStreamingSpeechProvider } from './local-streaming-stt.js';
import { createPiperTtsProvider } from './piper-tts.js';

const sttRegistry = new Map<string, () => SpeechProvider>([
  ['local-streaming', createLocalStreamingSpeechProvider],
]);

const ttsRegistry = new Map<string, () => TTSProvider>([
  ['piper', createPiperTtsProvider],
]);

export function resolveProviders(profile: VoiceProfile): {
  stt: SpeechProvider;
  tts: TTSProvider;
} {
  const sttFactory = sttRegistry.get(profile.sttProvider);
  const ttsFactory = ttsRegistry.get(profile.ttsProvider);
  if (!sttFactory) {
    throw new Error(`Unknown STT provider: ${profile.sttProvider}`);
  }
  if (!ttsFactory) {
    throw new Error(`Unknown TTS provider: ${profile.ttsProvider}`);
  }
  return { stt: sttFactory(), tts: ttsFactory() };
}
