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
      if (!text.trim()) return;

      for await (const frame of synthesizePcmViaAiRuntime(text, opts.voiceId)) {
        if (interrupted) break;
        yield frame;
      }
    },
  };
}
