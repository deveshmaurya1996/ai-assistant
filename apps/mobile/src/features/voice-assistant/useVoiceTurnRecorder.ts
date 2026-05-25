import { useCallback, useRef } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
} from 'expo-audio';
import { VOICE_TRANSCRIBE_RECORDING } from '@/features/voice/voiceRecordingOptions';
import { mimeFromUri } from '@/features/voice/mimeFromUri';
import { requestMicPermission } from '@/features/voice/requestVoicePermissions';

const SILENCE_DB = -48;
const SILENCE_MS = 800;
const MIN_RECORD_MS = 700;
const MAX_RECORD_MS = 20_000;
const LISTEN_IDLE_MS = 12_000;
const POLL_MS = 100;

export type RecordOutcome =
  | { kind: 'audio'; uri: string; mime: string }
  | { kind: 'idle' }
  | { kind: 'cancelled' };

export function useVoiceTurnRecorder() {
  const recorder = useAudioRecorder(VOICE_TRANSCRIBE_RECORDING);
  const recorderState = useAudioRecorderState(recorder, POLL_MS);
  const cancelledRef = useRef(false);

  const startRecording = useCallback(async () => {
    const status = recorder.getStatus();
    if (status.isRecording) {
      await recorder.stop();
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder]);

  const recordUntilSilence = useCallback(
    async (options?: {
      backgroundRecording?: boolean;
      onMetering?: (metering: number | undefined) => void;
    }): Promise<RecordOutcome> => {
      cancelledRef.current = false;

      const mic = await requestMicPermission();
      if (mic !== 'granted') {
        throw new Error('Microphone permission is required');
      }

      await setAudioModeAsync({
        allowsRecording: true,
        allowsBackgroundRecording: options?.backgroundRecording ?? true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });

      try {
        await startRecording();
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? `Could not start microphone: ${error.message}`
            : 'Could not start microphone'
        );
      }

      const startedAt = Date.now();
      let silenceSince: number | null = null;
      let heardSpeech = false;
      let endedIdle = false;

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (cancelledRef.current) {
            clearInterval(interval);
            resolve();
            return;
          }

          const elapsed = Date.now() - startedAt;
          const metering = recorder.getStatus().metering;
          options?.onMetering?.(metering);

          if (!heardSpeech && elapsed >= LISTEN_IDLE_MS) {
            endedIdle = true;
            clearInterval(interval);
            resolve();
            return;
          }

          if (typeof metering === 'number' && metering > SILENCE_DB) {
            heardSpeech = true;
            silenceSince = null;
          } else if (heardSpeech) {
            if (silenceSince === null) {
              silenceSince = Date.now();
            } else if (
              Date.now() - silenceSince >= SILENCE_MS &&
              elapsed >= MIN_RECORD_MS
            ) {
              clearInterval(interval);
              resolve();
            }
          }

          if (elapsed >= MAX_RECORD_MS) {
            clearInterval(interval);
            resolve();
          }
        }, POLL_MS);
      });

      if (recorder.getStatus().isRecording) {
        await recorder.stop();
      }

      if (cancelledRef.current) {
        return { kind: 'cancelled' };
      }

      if (endedIdle || !heardSpeech) {
        return { kind: 'idle' };
      }

      const uri = recorder.uri;
      if (!uri) {
        return { kind: 'idle' };
      }

      return { uri, mime: mimeFromUri(uri), kind: 'audio' };
    },
    [recorder, startRecording]
  );

  const cancelRecording = useCallback(async () => {
    cancelledRef.current = true;
    if (recorder.getStatus().isRecording) {
      await recorder.stop();
    }
  }, [recorder]);

  return {
    isRecording: recorderState.isRecording,
    recordUntilSilence,
    cancelRecording,
    recorder,
  };
}
