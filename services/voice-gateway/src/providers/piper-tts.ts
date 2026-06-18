import type { AudioFrame, TTSProvider, TTSOpts } from './types.js';
import { synthesizePcmViaAiRuntime } from '../ai-runtime-voice.js';

export function createPiperTtsProvider(): TTSProvider {
  let interrupted = false;

  return {
    id: 'piper',
    interrupt() {
      interrupted = true;
    },
    async *synthesizeStream(text: string, opts: TTSOpts): AsyncIterable<AudioFrame> {
      interrupted = false;

      const trimmed = text.trim();
      if (!trimmed) return;

      for await (const frame of synthesizePcmViaAiRuntime(trimmed, opts.voiceId, opts.signal)) {
        if (interrupted || opts.signal?.aborted) {
          break;
        }
        yield frame;
      }
    },
  };
}