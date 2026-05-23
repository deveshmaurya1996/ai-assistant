import { useCallback, useRef, useState } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { transcribeVoice } from '@/lib/api';
import { useSettingsStore } from '@/stores/settings';
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
    return true;
  }, [recorder, backgroundVoice]);

  const stopAndTranscribe = useCallback(async () => {
    if (!recorderState.isRecording) {
      return null;
    }

    setStatus('processing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        throw new Error('No recording file');
      }

      const result = await transcribeVoice(uri);
      setStatus('idle');
      return result.text;
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Transcription failed');
      return null;
    }
  }, [recorder, recorderState.isRecording]);

  const cancel = useCallback(async () => {
    if (recorderState.isRecording) {
      await recorder.stop();
    }
    setStatus('idle');
    setError(null);
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
