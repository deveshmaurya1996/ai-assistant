import type { DataPoint } from '@siteed/audio-studio';

/** Used when the recorder exposes native dB on data points. */
export const SPEECH_THRESHOLD_DB = -48;

/** Minimum consecutive analysis frames (~100ms at 50ms interval) to count as speech. */
export const SPEECH_FRAMES_REQUIRED = 2;

/** Peak normalized level (0–1) from amplitude/rms — works without native dB. */
export const SPEECH_PEAK_LEVEL = 0.08;

export function latestDataPoints(
  points: DataPoint[] | undefined,
  max = 48
): DataPoint[] {
  if (!points?.length) {
    return [];
  }
  return points.slice(-max);
}

export function levelFromDataPoints(points: DataPoint[]): number {
  if (points.length === 0) {
    return 0;
  }
  const last = points[points.length - 1];
  return Math.max(0, Math.min(1, last.amplitude ?? last.rms ?? 0));
}

export function decibelsFromDataPoints(points: DataPoint[]): number {
  if (points.length === 0) {
    return -60;
  }
  const last = points[points.length - 1];
  if (typeof last.dB === 'number' && !Number.isNaN(last.dB)) {
    return Math.max(-60, Math.min(0, last.dB));
  }
  return -60 + levelFromDataPoints(points) * 60;
}

export function isSpeechFromDataPoints(points: DataPoint[]): boolean {
  if (points.length === 0) {
    return false;
  }
  const last = points[points.length - 1];
  if (last.speech?.isActive) {
    return true;
  }
  if (!last.silent && typeof last.dB === 'number') {
    return last.dB > SPEECH_THRESHOLD_DB;
  }
  return !last.silent && (last.amplitude > 0.1 || last.rms > 0.02);
}

export function hadLikelySpeech(
  heardSpeechFrames: boolean,
  peakLevel: number,
  peakDb: number
): boolean {
  if (heardSpeechFrames) {
    return true;
  }
  if (peakLevel >= SPEECH_PEAK_LEVEL) {
    return true;
  }
  return peakDb > SPEECH_THRESHOLD_DB;
}
