import { useCallback, useRef } from 'react';
import { useSharedAudioRecorder } from '@siteed/audio-studio';
import { requireMicPermission } from '@/features/voice/requestVoicePermissions';
import { buildAssistantRecordingConfig } from '@/features/voice/studio/recordingConfig';
import {
  isSpeechFromDataPoints,
  latestDataPoints,
} from '@/features/voice/studio/analysis';
import {
  recordingFileUri,
  recordingMimeType,
} from '@/features/voice/studio/recordingUri';

const SILENCE_MS = 1200;
const MIN_RECORD_MS = 700;
const MAX_RECORD_MS = 5 * 60_000;
const LISTEN_IDLE_MS = 15_000;
const POLL_MS = 100;

export type RecordOutcome =
  | { kind: 'audio'; uri: string; mime: string }
  | { kind: 'idle' }
  | { kind: 'cancelled' };

export function useVoiceTurnRecorder() {
  const studio = useSharedAudioRecorder();
  const cancelledRef = useRef(false);

  const recordUntilSilence = useCallback(
    async (options?: {
      backgroundRecording?: boolean;
      onMetering?: (metering: number | undefined) => void;
    }): Promise<RecordOutcome> => {
      cancelledRef.current = false;

      try {
        if (studio.isRecording) {
          await studio.stopRecording();
        }

        await requireMicPermission();
        const config = buildAssistantRecordingConfig(
          async () => {},
          options?.backgroundRecording ?? true
        );
        await studio.prepareRecording(config);
        await studio.startRecording(config);
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
          const points = latestDataPoints(studio.analysisData?.dataPoints);
          const last = points[points.length - 1];
          options?.onMetering?.(last?.dB);

          if (!heardSpeech && elapsed >= LISTEN_IDLE_MS) {
            endedIdle = true;
            clearInterval(interval);
            resolve();
            return;
          }

          if (isSpeechFromDataPoints(points)) {
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

      let result = null;
      if (studio.isRecording) {
        result = await studio.stopRecording();
      }

      if (cancelledRef.current) {
        return { kind: 'cancelled' };
      }

      if (endedIdle || !heardSpeech) {
        return { kind: 'idle' };
      }

      if (!result) {
        return { kind: 'idle' };
      }

      const uri = recordingFileUri(result);
      if (!uri) {
        return { kind: 'idle' };
      }

      return { uri, mime: recordingMimeType(result), kind: 'audio' };
    },
    [studio]
  );

  const cancelRecording = useCallback(async () => {
    cancelledRef.current = true;
    if (studio.isRecording) {
      await studio.stopRecording();
    }
  }, [studio]);

  return {
    recordUntilSilence,
    cancelRecording,
  };
}
