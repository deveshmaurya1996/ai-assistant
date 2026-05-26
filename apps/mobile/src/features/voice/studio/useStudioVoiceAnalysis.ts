import { useMemo } from 'react';
import { useSharedAudioRecorder } from '@siteed/audio-studio';
import {
  decibelsFromDataPoints,
  isSpeechFromDataPoints,
  latestDataPoints,
  levelFromDataPoints,
} from './analysis';

export function useStudioVoiceAnalysis(enabled: boolean) {
  const { analysisData, isRecording } = useSharedAudioRecorder();

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
