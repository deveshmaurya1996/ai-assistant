import type { AudioAnalysis, RecordingConfig } from '@siteed/audio-studio';

const ANALYSIS_FEATURES = {
  rms: true,
  energy: true,
} as const;

function baseConfig(
  onAudioAnalysis: (event: AudioAnalysis) => Promise<void>
): RecordingConfig {
  return {
    sampleRate: 16000,
    channels: 1,
    encoding: 'pcm_16bit',
    enableProcessing: true,
    keepFullAnalysis: false,
    intervalAnalysis: 50,
    segmentDurationMs: 100,
    features: ANALYSIS_FEATURES,
    onAudioAnalysis,
    output: {
      primary: { enabled: true, format: 'wav' },
      compressed: {
        enabled: true,
        format: 'aac',
        bitrate: 64000,
        preferRawStream: false,
      },
    },
  };
}

export function buildChatRecordingConfig(
  onAudioAnalysis: (event: AudioAnalysis) => Promise<void>
): RecordingConfig {
  return {
    ...baseConfig(onAudioAnalysis),
    keepAwake: false,
    android: { audioFocusStrategy: 'interactive' },
    ios: {
      audioSession: {
        category: 'PlayAndRecord',
        mode: 'VoiceChat',
      },
    },
  };
}

export function buildAssistantRecordingConfig(
  onAudioAnalysis: (event: AudioAnalysis) => Promise<void>,
  backgroundRecording: boolean
): RecordingConfig {
  return {
    ...baseConfig(onAudioAnalysis),
    keepAwake: backgroundRecording,
    showNotification: backgroundRecording,
    showWaveformInNotification: backgroundRecording,
    android: {
      audioFocusStrategy: backgroundRecording ? 'background' : 'interactive',
    },
    ios: {
      audioSession: {
        category: 'PlayAndRecord',
        mode: 'VoiceChat',
        categoryOptions: backgroundRecording ? ['AllowBluetooth'] : undefined,
      },
    },
  };
}
