import { useCallback, useState } from 'react';
import { useSharedAudioRecorder } from '@siteed/audio-studio';
import { requireMicPermission } from '@/features/voice/requestVoicePermissions';
import { buildChatRecordingConfig } from '@/features/voice/studio/recordingConfig';
import { recordingFileUri } from '@/features/voice/studio/recordingUri';
import { useStudioVoiceAnalysis } from '@/features/voice/studio/useStudioVoiceAnalysis';

export type VoiceCaptureStatus = 'idle' | 'recording' | 'processing' | 'error';

export function useVoiceCapture(_mode: 'chat' | 'assistant' = 'chat') {
  const studio = useSharedAudioRecorder();
  const [status, setStatus] = useState<VoiceCaptureStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const isRecording = status === 'recording';
  const analysis = useStudioVoiceAnalysis(isRecording);

  const start = useCallback(async () => {
    setError(null);
    try {
      await requireMicPermission();
      const config = buildChatRecordingConfig(async () => {});
      await studio.prepareRecording(config);
      await studio.startRecording(config);
      setStatus('recording');
      return true;
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not start recording');
      return false;
    }
  }, [studio]);

  const stop = useCallback(async (): Promise<string | null> => {
    if (!isRecording && !studio.isRecording) {
      return null;
    }
    try {
      const result = await studio.stopRecording();
      if (!result) {
        return null;
      }
      return recordingFileUri(result);
    } catch {
      return null;
    }
  }, [isRecording, studio]);

  const cancel = useCallback(async () => {
    if (studio.isRecording) {
      await studio.stopRecording();
    }
    setStatus('idle');
    setError(null);
  }, [studio]);

  const setProcessing = useCallback(() => {
    setStatus('processing');
  }, []);

  const setIdle = useCallback(() => {
    setStatus('idle');
  }, []);

  const setFailed = useCallback((message: string) => {
    setStatus('error');
    setError(message);
  }, []);

  return {
    status,
    error,
    isRecording,
    isProcessing: status === 'processing',
    meteringLevel: analysis.meteringLevel,
    meteringDecibels: analysis.meteringDecibels,
    isSpeechDetected: analysis.isSpeechDetected,
    dataPoints: analysis.dataPoints,
    start,
    stop,
    cancel,
    setProcessing,
    setIdle,
    setFailed,
  };
}
