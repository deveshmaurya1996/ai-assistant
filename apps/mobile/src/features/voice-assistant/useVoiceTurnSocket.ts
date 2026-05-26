import { useCallback, useRef, type RefObject } from 'react';
import type {
  AssistantSocket,
  VoiceErrorPayload,
  VoiceFinalPayload,
  VoicePartialPayload,
} from '@ai-assistant/sdk';
import { formatVoiceStepError } from '@/lib/format-ai-error';
import { transcribeVoice } from '@/lib/transcribe-voice';
import { mimeFromUri } from '@/features/voice/mimeFromUri';

const CHUNK_BYTES = 48 * 1024;
const TURN_TIMEOUT_MS = 90_000;

function newTurnId(): string {
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const encode =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa.bind(globalThis)
      : null;
  if (!encode) {
    throw new Error('Base64 encoding is not available');
  }
  let binary = '';
  const page = 8192;
  for (let i = 0; i < bytes.length; i += page) {
    const slice = bytes.subarray(i, i + page);
    binary += String.fromCharCode(...slice);
  }
  return encode(binary);
}

async function readAudioBytes(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error(`Could not read recording (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export function useVoiceTurnSocket(socketRef: RefObject<AssistantSocket | null>) {
  const pendingRef = useRef(
    new Map<
      string,
      {
        resolve: (text: string) => void;
        reject: (err: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >()
  );

  const attachListeners = useCallback((socket: AssistantSocket) => {
    const onFinal = (data: VoiceFinalPayload) => {
      const pending = pendingRef.current.get(data.turnId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingRef.current.delete(data.turnId);
      pending.resolve(data.text);
    };

    const onError = (data: VoiceErrorPayload) => {
      const pending = pendingRef.current.get(data.turnId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingRef.current.delete(data.turnId);
      pending.reject(new Error(data.error));
    };

    const onPartial = (_data: VoicePartialPayload) => {
      /* reserved for live partial transcript UI */
    };

    socket.on('voice:final', onFinal);
    socket.on('voice:error', onError);
    socket.on('voice:partial', onPartial);

    return () => {
      socket.off('voice:final', onFinal);
      socket.off('voice:error', onError);
      socket.off('voice:partial', onPartial);
    };
  }, []);

  const transcribeViaSocket = useCallback(
    async (chatSessionId: string | null, audioUri: string): Promise<string | null> => {
      const socket = socketRef.current;
      if (!chatSessionId || !socket?.connected) {
        const result = await transcribeVoice(audioUri, mimeFromUri(audioUri));
        return result.text.trim() || null;
      }

      const turnId = newTurnId();
      const mime = mimeFromUri(audioUri);
      const bytes = await readAudioBytes(audioUri);

      const textPromise = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRef.current.delete(turnId);
          reject(new Error('Transcription timed out'));
        }, TURN_TIMEOUT_MS);
        pendingRef.current.set(turnId, { resolve, reject, timer });
      });

      socket.emit('voice:turn_start', { chatSessionId, turnId });

      let seq = 0;
      for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
        const slice = bytes.subarray(offset, offset + CHUNK_BYTES);
        socket.emit('voice:turn_audio', {
          turnId,
          seq: seq++,
          mime,
          chunk: uint8ToBase64(slice),
        });
      }

      socket.emit('voice:turn_end', { turnId });

      try {
        const text = await textPromise;
        return text.trim() || null;
      } catch (error) {
        throw new Error(formatVoiceStepError('transcription', error));
      }
    },
    [socketRef]
  );

  return { transcribeViaSocket, attachListeners };
}
