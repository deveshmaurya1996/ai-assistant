import { useMemo } from 'react';
import type { useSharedAudioRecorder } from '@siteed/audio-studio';
import {
  decibelsFromDataPoints,
  isSpeechFromDataPoints,
  latestDataPoints,
  levelFromDataPoints,
} from './analysis';

export type SharedAudioRecorder = ReturnType<typeof useSharedAudioRecorder>;

export function useStudioVoiceAnalysis(
  enabled: boolean,
  studio: Pick<SharedAudioRecorder, 'analysisData' | 'isRecording'>
) {
  const { analysisData, isRecording } = studio;

  const dataPoints = useMemo(() => {
    if (!enabled || !isRecording) {
      return [];
    }
    return latestDataPoints(analysisData?.dataPoints);
  }, [analysisData?.dataPoints, enabled, isRecording]);

  const meteringLevel = useMemo(() => levelFromDataPoints(dataPoints), [dataPoints]);
  const meteringDecibels = useMemo(
    () => decibelsFromDataPoints(dataPoints),
    [dataPoints]
  );
  const isSpeechDetected = useMemo(
    () => isSpeechFromDataPoints(dataPoints),
    [dataPoints]
  );

  return {
    dataPoints,
    meteringLevel,
    meteringDecibels,
    isSpeechDetected,
  };
}
