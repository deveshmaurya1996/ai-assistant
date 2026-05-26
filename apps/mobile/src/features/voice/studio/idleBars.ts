import type { DataPoint } from '@siteed/audio-studio';

export function idleWaveformBars(count = 12, level = 0.06): DataPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const wave = 0.55 + 0.45 * Math.sin(i * 0.65 + 0.4);
    const amplitude = level * wave;
    return {
      id: i,
      amplitude,
      rms: amplitude,
      dB: -48 + amplitude * 12,
      silent: true,
    };
  });
}
