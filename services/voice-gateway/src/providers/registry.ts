import type { VoiceProfile } from '@ai-assistant/types';
import type { SpeechProvider, TTSProvider } from './types.js';
import { createFasterWhisperSpeechProvider } from './faster-whisper-stt.js';
import { createPiperTtsProvider } from './piper-tts.js';

const sttRegistry = new Map<string, () => SpeechProvider>([
  ['faster-whisper', createFasterWhisperSpeechProvider],
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
