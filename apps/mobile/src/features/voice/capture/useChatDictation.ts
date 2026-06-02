import { useCallback, useState } from 'react';
import { transcribeVoice } from '@/lib/transcribe-voice';
import { mimeFromUri } from '@/features/voice/mimeFromUri';
import {
  isFfmpegRequiredError,
  isNoSpeechTranscriptionError,
} from '@/lib/voice-transcription';
import { MIN_CHAT_RECORD_MS, useVoiceCapture } from './useVoiceCapture';

export type ChatDictationResult =
  | { kind: 'text'; text: string }
  | { kind: 'no-speech' }
  | { kind: 'error'; message: string }
  | { kind: 'started' };

export function useChatDictation() {
  const capture = useVoiceCapture('chat');
  const [hint, setHint] = useState<string | null>(null);

  const toggleRecording = useCallback(async (): Promise<ChatDictationResult> => {
    if (capture.isProcessing) {
      return { kind: 'error', message: 'Processing…' };
    }

    if (capture.isRecording) {
      capture.setProcessing();
      setHint(null);
      try {
        const uri = await capture.stop();
        const { durationMs } = capture.getRecordingMeta();

        if (!uri) {
          capture.setFailed('No recording file');
          return { kind: 'error', message: 'No recording file' };
        }

        if (durationMs < MIN_CHAT_RECORD_MS) {
          capture.setIdle();
          setHint('Hold the mic a little longer');
          return { kind: 'no-speech' };
        }

        const { text } = await transcribeVoice(uri, mimeFromUri(uri));
        const trimmed = text?.trim() ?? '';
        capture.setIdle();

        if (!trimmed) {
          setHint('No speech detected');
          return { kind: 'no-speech' };
        }

        return { kind: 'text', text: trimmed };
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Transcription failed';
        if (isNoSpeechTranscriptionError(message)) {
          capture.setIdle();
          setHint('No speech detected');
          return { kind: 'no-speech' };
        }
        if (isFfmpegRequiredError(message)) {
          capture.setFailed('Voice server missing ffmpeg');
          return {
            kind: 'error',
            message: 'Voice transcription unavailable — install ffmpeg on the AI server.',
          };
        }
        capture.setFailed(message);
        return { kind: 'error', message };
      }
    }

    setHint(null);
    await capture.start();
    return { kind: 'started' };
  }, [capture]);

  const cancel = useCallback(async () => {
    await capture.cancel();
    setHint(null);
  }, [capture]);

  return {
    status: capture.status,
    error: capture.error,
    hint,
    isRecording: capture.isRecording,
    isProcessing: capture.isProcessing,
    meteringLevel: capture.meteringLevel,
    meteringDecibels: capture.meteringDecibels,
    isSpeechDetected: capture.isSpeechDetected,
    dataPoints: capture.dataPoints,
    toggleRecording,
    cancel,
  };
}
