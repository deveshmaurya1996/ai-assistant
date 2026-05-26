import type { DataPoint } from '@siteed/audio-studio';

export const SPEECH_THRESHOLD_DB = -48;

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
  return !last.silent && (last.amplitude > 0.12 || last.rms > 0.025);
}
