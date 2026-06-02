import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioAnalysis, DataPoint } from '@siteed/audio-studio';
import { useSharedAudioRecorder } from '@siteed/audio-studio';
import { requireMicPermission } from '@/features/voice/requestVoicePermissions';
import { buildChatRecordingConfig } from '@/features/voice/studio/recordingConfig';
import { recordingFileUri } from '@/features/voice/studio/recordingUri';
import {
  decibelsFromDataPoints,
  hadLikelySpeech,
  isSpeechFromDataPoints,
  latestDataPoints,
  levelFromDataPoints,
  SPEECH_FRAMES_REQUIRED,
} from '@/features/voice/studio/analysis';
import { useStudioVoiceAnalysis } from '@/features/voice/studio/useStudioVoiceAnalysis';

export const MIN_CHAT_RECORD_MS = 400;

export type VoiceCaptureStatus = 'idle' | 'recording' | 'processing' | 'error';

export function useVoiceCapture(_mode: 'chat' | 'assistant' = 'chat') {
  const studio = useSharedAudioRecorder();
  const [status, setStatus] = useState<VoiceCaptureStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const heardSpeechRef = useRef(false);
  const speechFrameCountRef = useRef(0);
  const peakDecibelsRef = useRef(-60);
  const peakLevelRef = useRef(0);
  const recordingStartedAtRef = useRef(0);
  const lastRecordingDurationMsRef = useRef(0);

  const isRecording = status === 'recording';
  const analysis = useStudioVoiceAnalysis(isRecording);

  const ingestMetering = useCallback((points: DataPoint[]) => {
    if (points.length === 0) {
      return;
    }
    const db = decibelsFromDataPoints(points);
    const level = levelFromDataPoints(points);
    if (db > peakDecibelsRef.current) {
      peakDecibelsRef.current = db;
    }
    if (level > peakLevelRef.current) {
      peakLevelRef.current = level;
    }
    if (isSpeechFromDataPoints(points)) {
      speechFrameCountRef.current += 1;
      if (speechFrameCountRef.current >= SPEECH_FRAMES_REQUIRED) {
        heardSpeechRef.current = true;
      }
    } else {
      speechFrameCountRef.current = 0;
    }
  }, []);

  const onAudioAnalysis = useCallback(
    async (event: AudioAnalysis) => {
      ingestMetering(latestDataPoints(event.dataPoints));
    },
    [ingestMetering]
  );

  useEffect(() => {
    if (!isRecording) {
      return;
    }
    ingestMetering(latestDataPoints(studio.analysisData?.dataPoints));
  }, [ingestMetering, isRecording, studio.analysisData?.dataPoints]);

  const start = useCallback(async () => {
    setError(null);
    heardSpeechRef.current = false;
    speechFrameCountRef.current = 0;
    peakDecibelsRef.current = -60;
    peakLevelRef.current = 0;
    lastRecordingDurationMsRef.current = 0;
    try {
      await requireMicPermission();
      recordingStartedAtRef.current = Date.now();
      const config = buildChatRecordingConfig(onAudioAnalysis);
      await studio.prepareRecording(config);
      await studio.startRecording(config);
      setStatus('recording');
      return true;
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not start recording');
      return false;
    }
  }, [onAudioAnalysis, studio]);

  const stop = useCallback(async (): Promise<string | null> => {
    if (!isRecording && !studio.isRecording) {
      return null;
    }
    try {
      if (recordingStartedAtRef.current > 0) {
        lastRecordingDurationMsRef.current = Math.max(
          0,
          Date.now() - recordingStartedAtRef.current
        );
      }
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
    getRecordingMeta: () => ({
      hadSpeech: hadLikelySpeech(
        heardSpeechRef.current,
        peakLevelRef.current,
        peakDecibelsRef.current
      ),
      durationMs: lastRecordingDurationMsRef.current,
      peakDecibels: peakDecibelsRef.current,
      peakLevel: peakLevelRef.current,
    }),
    dataPoints: analysis.dataPoints,
    start,
    stop,
    cancel,
    setProcessing,
    setIdle,
    setFailed,
  };
}
