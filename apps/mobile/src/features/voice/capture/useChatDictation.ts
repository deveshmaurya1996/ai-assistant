import { useCallback } from 'react';
import { transcribeVoice } from '@/lib/transcribe-voice';
import { mimeFromUri } from '@/features/voice/mimeFromUri';
import { useVoiceCapture } from './useVoiceCapture';

export function useChatDictation() {
  const capture = useVoiceCapture('chat');

  const toggleRecording = useCallback(async (): Promise<string | null> => {
    if (capture.isProcessing) {
      return null;
    }

    if (capture.isRecording) {
      capture.setProcessing();
      try {
        const uri = await capture.stop();
        if (!uri) {
          capture.setFailed('No recording file');
          return null;
        }
        const { text } = await transcribeVoice(uri, mimeFromUri(uri));
        capture.setIdle();
        return text;
      } catch (e) {
        capture.setFailed(
          e instanceof Error ? e.message : 'Transcription failed'
        );
        return null;
      }
    }

    await capture.start();
    return null;
  }, [capture]);

  const cancel = useCallback(async () => {
    await capture.cancel();
  }, [capture]);

  return {
    status: capture.status,
    error: capture.error,
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
