import Redis from 'ioredis';
import { config } from '@ai-assistant/config';
import type { VoiceSessionState, VoiceTurnAnalytics } from '@ai-assistant/types';

const SESSION_TTL_SEC = 86_400;
const KEY_PREFIX = 'voice:session:';
const CHAT_INDEX_PREFIX = 'voice:session-by-chat:';

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 10_000,
    });
    redisClient.on('error', (err) => {
      console.warn('[voice-session:redis]', err.message);
    });
  }
  return redisClient;
}

function sessionKey(roomId: string): string {
  return `${KEY_PREFIX}${roomId}`;
}

function chatIndexKey(chatSessionId: string): string {
  return `${CHAT_INDEX_PREFIX}${chatSessionId}`;
}

export async function saveVoiceSession(state: VoiceSessionState): Promise<void> {
  const redis = getRedis();
  const payload = JSON.stringify(state);
  await redis.set(sessionKey(state.roomId), payload, 'EX', SESSION_TTL_SEC);
  await redis.set(chatIndexKey(state.chatSessionId), state.roomId, 'EX', SESSION_TTL_SEC);
}

export async function getVoiceSessionByRoom(
  roomId: string
): Promise<VoiceSessionState | null> {
  const raw = await getRedis().get(sessionKey(roomId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VoiceSessionState;
  } catch {
    return null;
  }
}

export async function getVoiceSessionByChatSession(
  chatSessionId: string
): Promise<VoiceSessionState | null> {
  const roomId = await getRedis().get(chatIndexKey(chatSessionId));
  if (!roomId) return null;
  return getVoiceSessionByRoom(roomId);
}

export async function patchVoiceSession(
  roomId: string,
  patch: Partial<VoiceSessionState>
): Promise<VoiceSessionState | null> {
  const existing = await getVoiceSessionByRoom(roomId);
  if (!existing) return null;
  const next: VoiceSessionState = {
    ...existing,
    ...patch,
    lastActivityAt: new Date().toISOString(),
  };
  await saveVoiceSession(next);
  return next;
}

export async function setActiveVoiceTurn(
  roomId: string,
  turnId: string | null
): Promise<void> {
  await patchVoiceSession(roomId, { activeTurnId: turnId });
}

export async function storeVoiceAnalytics(
  roomId: string,
  analytics: VoiceTurnAnalytics
): Promise<void> {
  await patchVoiceSession(roomId, { lastAnalytics: analytics });
}

export function resolveVoiceRoomId(chatSessionId: string): string {
  return `voice-${chatSessionId}`;
}
