import type { Socket } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import type {
  VoiceTurnAudioPayload,
  VoiceTurnCancelPayload,
  VoiceTurnEndPayload,
  VoiceTurnStartPayload,
} from '@ai-assistant/types';
import { assertSessionAccess } from '../services/chat.service';
import { AppError } from '../lib/errors';
import { fetchAi } from '../lib/http';
import { enforceSocketRateLimits, getClientIp } from '../lib/rate-limit';

const CHUNK_SIZE = 48 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 90_000;

type TurnBuffer = {
  chatSessionId: string;
  userId: string;
  chunks: Map<number, Buffer>;
  mime: string;
};

const activeTurns = new WeakMap<Socket, Map<string, TurnBuffer>>();
const processingTurnIds = new WeakMap<Socket, Set<string>>();

function getTurnMap(socket: Socket): Map<string, TurnBuffer> {
  let map = activeTurns.get(socket);
  if (!map) {
    map = new Map();
    activeTurns.set(socket, map);
  }
  return map;
}

function getProcessingSet(socket: Socket): Set<string> {
  let set = processingTurnIds.get(socket);
  if (!set) {
    set = new Set();
    processingTurnIds.set(socket, set);
  }
  return set;
}

function assembleAudio(turn: TurnBuffer): { buffer: Buffer; mime: string } {
  const seqs = [...turn.chunks.keys()].sort((a, b) => a - b);
  const parts = seqs.map((s) => turn.chunks.get(s)!);
  return { buffer: Buffer.concat(parts), mime: turn.mime || 'audio/m4a' };
}

function extensionForMime(mime: string): string {
  if (mime.includes('webm')) return 'recording.webm';
  if (mime.includes('wav')) return 'recording.wav';
  if (mime.includes('3gpp')) return 'recording.3gp';
  return 'recording.m4a';
}

async function transcribeTurnAudio(
  buffer: Buffer,
  mime: string
): Promise<string> {
  if (buffer.length === 0) {
    return '';
  }

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(buffer)], { type: mime }),
    extensionForMime(mime)
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

  try {
    const result = await fetchAi<{ text: string }>('/v1/voice/transcribe', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    return (result.text ?? '').trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function processTurnEnd(
  socket: Socket,
  data: VoiceTurnEndPayload,
  getUserId: () => string | null,
  fastify: FastifyInstance
): Promise<void> {
  const userId = getUserId();
  if (!userId) {
    socket.emit('voice:error', { turnId: data.turnId, error: 'Unauthorized' });
    return;
  }

  const processing = getProcessingSet(socket);
  if (processing.has(data.turnId)) {
    return;
  }

  const map = getTurnMap(socket);
  const turn = map.get(data.turnId);
  if (!turn) {
    socket.emit('voice:error', { turnId: data.turnId, error: 'Unknown turn' });
    return;
  }

  map.delete(data.turnId);
  processing.add(data.turnId);

  try {
    await assertSessionAccess(userId, turn.chatSessionId);
    const clientIp = getClientIp(socket.handshake.headers);
    enforceSocketRateLimits(clientIp, userId, 'voice:turn_end');

    socket.emit('voice:processing', { turnId: data.turnId });
    socket.emit('voice:partial', { turnId: data.turnId, text: '' });

    const { buffer, mime } = assembleAudio(turn);
    const text = await transcribeTurnAudio(buffer, mime);

    socket.emit('voice:final', { turnId: data.turnId, text });
  } catch (err) {
    const message =
      err instanceof AppError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Transcription failed';
    fastify.log.error({ err, turnId: data.turnId, userId }, 'voice:turn_end failed');
    socket.emit('voice:error', { turnId: data.turnId, error: message });
  } finally {
    processing.delete(data.turnId);
  }
}

export function registerVoiceTurnHandlers(
  socket: Socket,
  fastify: FastifyInstance,
  getUserId: () => string | null
) {
  socket.on('voice:turn_start', async (data: VoiceTurnStartPayload) => {
    const userId = getUserId();
    if (!userId) {
      socket.emit('voice:error', { turnId: data.turnId, error: 'Unauthorized' });
      return;
    }
    if (!data?.turnId || !data?.chatSessionId) {
      socket.emit('voice:error', {
        turnId: data?.turnId ?? 'unknown',
        error: 'turnId and chatSessionId are required',
      });
      return;
    }

    try {
      await assertSessionAccess(userId, data.chatSessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Access denied';
      socket.emit('voice:error', { turnId: data.turnId, error: message });
      return;
    }

    getTurnMap(socket).set(data.turnId, {
      chatSessionId: data.chatSessionId,
      userId,
      chunks: new Map(),
      mime: 'audio/m4a',
    });
  });

  socket.on('voice:turn_audio', (data: VoiceTurnAudioPayload) => {
    const userId = getUserId();
    if (!userId) return;

    const turn = getTurnMap(socket).get(data.turnId);
    if (!turn || turn.userId !== userId) return;

    try {
      const buf = Buffer.from(data.chunk, 'base64');
      if (buf.length > CHUNK_SIZE * 2) {
        socket.emit('voice:error', {
          turnId: data.turnId,
          error: 'Chunk too large',
        });
        return;
      }
      turn.chunks.set(data.seq, buf);
      if (data.mime) {
        turn.mime = data.mime;
      }
    } catch {
      socket.emit('voice:error', {
        turnId: data.turnId,
        error: 'Invalid audio chunk encoding',
      });
    }
  });

  socket.on('voice:turn_end', (data: VoiceTurnEndPayload) => {
    void processTurnEnd(socket, data, getUserId, fastify);
  });

  socket.on('voice:turn_cancel', (data: VoiceTurnCancelPayload) => {
    getTurnMap(socket).delete(data.turnId);
    getProcessingSet(socket).delete(data.turnId);
  });
}
