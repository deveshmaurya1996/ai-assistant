import { useCallback, useState } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { transcribeVoice } from '@/lib/transcribe-voice';
import { useSettingsStore } from '@/stores/settings';
import { setBubbleState } from '@/lib/overlay';
import { mimeFromUri } from './mimeFromUri';
import { requestMicPermission, requestNotificationPermission } from './requestVoicePermissions';

export type VoiceRecorderStatus = 'idle' | 'recording' | 'processing' | 'error';

export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const backgroundVoice = useSettingsStore((s) => s.backgroundVoiceEnabled);

  const startRecording = useCallback(async () => {
    setError(null);
    const mic = await requestMicPermission();
    if (mic !== 'granted') {
      setStatus('error');
      setError('Microphone permission is required');
      return false;
    }

    if (backgroundVoice) {
      await requestNotificationPermission();
    }

    await setAudioModeAsync({
      allowsRecording: true,
      allowsBackgroundRecording: backgroundVoice,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    });

    await recorder.prepareToRecordAsync();
    recorder.record();
    setStatus('recording');
    void setBubbleState('listening');
    return true;
  }, [recorder, backgroundVoice]);

  const stopAndTranscribe = useCallback(async () => {
    const wasRecording = status === 'recording' || recorderState.isRecording;
    if (!wasRecording) {
      setStatus('error');
      setError('Recording did not start — check microphone permission');
      return null;
    }

    setStatus('processing');
    void setBubbleState('processing');
    try {
      if (recorderState.isRecording) {
        await recorder.stop();
      }

      const uri = recorder.uri;
      if (!uri) {
        throw new Error('No recording file');
      }

      const result = await transcribeVoice(uri, mimeFromUri(uri));
      setStatus('idle');
      void setBubbleState('idle');
      return result.text;
    } catch (e) {
      setStatus('error');
      void setBubbleState('idle');
      setError(e instanceof Error ? e.message : 'Transcription failed');
      return null;
    }
  }, [recorder, recorderState.isRecording, status]);

  const cancel = useCallback(async () => {
    if (recorderState.isRecording) {
      await recorder.stop();
    }
    setStatus('idle');
    setError(null);
    void setBubbleState('idle');
  }, [recorder, recorderState.isRecording]);

  return {
    status,
    error,
    isRecording: recorderState.isRecording || status === 'recording',
    startRecording,
    stopAndTranscribe,
    cancel,
  };
}
