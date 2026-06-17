import type { SpeechProvider, SpeechStream, SpeechStreamOpts } from './types.js';
import { transcribeViaAiRuntime } from '../ai-runtime-voice.js';

export function createFasterWhisperSpeechProvider(): SpeechProvider {
  return {
    id: 'faster-whisper',
    startStream(opts: SpeechStreamOpts): SpeechStream {
      const chunks: Buffer[] = [];
      let cancelled = false;

      return {
        pushAudio(frame: Buffer) {
          if (!cancelled) chunks.push(frame);
        },
        async end() {
          if (cancelled) return;
          const audio = Buffer.concat(chunks);
          chunks.length = 0;
          if (!audio.length) {
            opts.onFinal('');
            return;
          }
          try {
            const text = await transcribeViaAiRuntime(audio, 'audio.raw');
            opts.onFinal(text);
          } catch (err) {
            opts.onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        },
        cancel() {
          cancelled = true;
          chunks.length = 0;
        },
      };
    },
  };
}
