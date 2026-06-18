export const VOICE_STT_PROVIDER = 'local-streaming' as const;
export const VOICE_TTS_PROVIDER = 'piper' as const;
export const DEFAULT_PIPER_VOICE = 'en_US-lessac-medium' as const;

export const VOICE_PROVIDERS = {
  stt: { default: VOICE_STT_PROVIDER },
  tts: { default: VOICE_TTS_PROVIDER },
} as const;

export type VoiceMode = 'livekit' | 'unconfigured';

export interface VoiceModeResponse {
  mode: VoiceMode | string;
  available: string[];
  note?: string;
  future_modes?: string[];
  full_duplex_available?: boolean;
  pollinations_voice?: boolean;
  stt_provider?: string;
  tts_provider?: string;
}
