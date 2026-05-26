import type { DataPoint } from '@siteed/audio-studio';
import { idleWaveformBars } from './idleBars';

export function perceptualAmplitude(point: DataPoint): number {
  const raw = Math.max(0, Math.min(1, point.amplitude ?? point.rms ?? 0));
  return Math.sqrt(raw);
}

export function resampleDataPoints(points: DataPoint[], count: number): DataPoint[] {
  if (count <= 0) {
    return [];
  }
  if (points.length === 0) {
    return idleWaveformBars(count, 0.08);
  }
  if (points.length === count) {
    return points;
  }
  if (points.length < count) {
    const out: DataPoint[] = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const idx = Math.min(points.length - 1, Math.round(t * (points.length - 1)));
      out.push(points[idx]);
    }
    return out;
  }

  const out: DataPoint[] = [];
  const binSize = points.length / count;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * binSize);
    const end = Math.floor((i + 1) * binSize);
    const bin = points.slice(start, Math.max(start + 1, end));
    let best = bin[0];
    let peak = perceptualAmplitude(best);
    for (const p of bin) {
      const amp = perceptualAmplitude(p);
      if (amp >= peak) {
        peak = amp;
        best = p;
      }
    }
    out.push(best);
  }
  return out;
}

/** ChatGPT / Gemini style: a few vertical bars from recent audio buckets. */
const EQUALIZER_PROFILE = [0.52, 0.78, 1, 0.84, 0.56, 0.72, 0.94];

export function equalizerLevels(points: DataPoint[], barCount: number): number[] {
  const resampled = resampleDataPoints(points, Math.max(barCount * 6, 24));
  const levels: number[] = [];
  const binSize = resampled.length / barCount;

  for (let i = 0; i < barCount; i++) {
    const start = Math.floor(i * binSize);
    const end = Math.floor((i + 1) * binSize);
    const bin = resampled.slice(start, Math.max(start + 1, end));
    let peak = 0.1;
    for (const p of bin) {
      peak = Math.max(peak, perceptualAmplitude(p));
    }
    const profile = EQUALIZER_PROFILE[i % EQUALIZER_PROFILE.length];
    levels.push(Math.min(1, peak * profile));
  }

  return levels;
}
