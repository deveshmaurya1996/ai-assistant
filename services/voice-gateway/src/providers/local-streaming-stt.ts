import type { SpeechProvider, SpeechStream, SpeechStreamOpts } from './types.js';
import { voiceGatewayConfig } from '../config.js';

export function createLocalStreamingSpeechProvider(): SpeechProvider {
  return {
    id: 'local-streaming',
    startStream(opts: SpeechStreamOpts): SpeechStream {
      const baseHttpUrl = voiceGatewayConfig.intelligenceUrl || 'http://localhost:8000';
      const wsBaseUrl = baseHttpUrl.replace(/^http/, 'ws');
      const wsUrl = wsBaseUrl.endsWith('/v1')
        ? `${wsBaseUrl}/voice/stt/ws`
        : `${wsBaseUrl}/v1/voice/stt/ws`;

      console.log(`[local-streaming-stt] Connecting to ${wsUrl}`);
      const ws = new globalThis.WebSocket(wsUrl);

      let isClosed = false;
      const pendingChunks: Buffer[] = [];

      ws.onopen = () => {
        if (isClosed) return;
        ws.send(
          JSON.stringify({
            type: 'start',
            sample_rate: 16000,
            channels: 1,
            language: opts.language || 'en',
          })
        );

        while (pendingChunks.length > 0) {
          const chunk = pendingChunks.shift();
          if (chunk) {
            ws.send(new Uint8Array(chunk.buffer as ArrayBuffer, chunk.byteOffset, chunk.byteLength));
          }
        }
      };

      ws.onmessage = (event) => {
        if (isClosed) return;
        try {
          const data = JSON.parse(event.data as string);
          switch (data.type) {
            case 'speech_started':
              opts.onSpeechStart?.();
              break;
            case 'partial':
              opts.onPartial?.(data.text);
              break;
            case 'final':
              opts.onFinal(data.text);
              break;
            case 'speech_ended':
              opts.onSpeechEnd?.();
              break;
            case 'error':
              opts.onError?.(new Error(data.message || 'Streaming STT server error'));
              break;
          }
        } catch (err) {
          console.error('[local-streaming-stt] Failed to parse message:', err);
        }
      };

      ws.onerror = (event) => {
        if (isClosed) return;
        opts.onError?.(new Error('WebSocket error on streaming STT'));
      };

      ws.onclose = () => {
        console.log('[local-streaming-stt] WebSocket connection closed');
      };

      return {
        pushAudio(frame: Buffer) {
          if (isClosed) return;
          if (ws.readyState === ws.OPEN) {
            ws.send(new Uint8Array(frame.buffer as ArrayBuffer, frame.byteOffset, frame.byteLength));
          } else if (ws.readyState === ws.CONNECTING) {
            pendingChunks.push(frame);
          }
        },
        end() {
          if (isClosed) return;
          if (ws.readyState === ws.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'stop' }));
              ws.close();
            } catch (err) {
              console.error('[local-streaming-stt] Error sending stop/closing:', err);
            }
          } else {
            ws.close();
          }
          isClosed = true;
          pendingChunks.length = 0;
        },
        cancel() {
          if (isClosed) return;
          isClosed = true;
          pendingChunks.length = 0;
          try {
            ws.close();
          } catch {}
        },
      };
    },
  };
}
