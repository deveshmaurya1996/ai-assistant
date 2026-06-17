import { Redis } from 'ioredis';
import type { VoiceSessionState, VoiceTurnAnalytics } from '@ai-assistant/types';
import { voiceGatewayConfig } from './config.js';

const KEY_PREFIX = 'voice:session:';
const SESSION_TTL_SEC = 86_400;

let redis: Redis | null = null;

function client(): Redis {
  if (!redis) {
    redis = new Redis(voiceGatewayConfig.redisUrl, { maxRetriesPerRequest: 3 });
  }
  return redis;
}

export async function loadVoiceSession(roomId: string): Promise<VoiceSessionState | null> {
  const raw = await client().get(`${KEY_PREFIX}${roomId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VoiceSessionState;
  } catch {
    return null;
  }
}

export async function patchVoiceSession(
  roomId: string,
  patch: Partial<VoiceSessionState>
): Promise<VoiceSessionState | null> {
  const existing = await loadVoiceSession(roomId);
  if (!existing) return null;
  const next: VoiceSessionState = {
    ...existing,
    ...patch,
    lastActivityAt: new Date().toISOString(),
  };
  await client().set(`${KEY_PREFIX}${roomId}`, JSON.stringify(next), 'EX', SESSION_TTL_SEC);
  return next;
}

export async function storeVoiceAnalytics(
  roomId: string,
  analytics: VoiceTurnAnalytics
): Promise<void> {
  await patchVoiceSession(roomId, { lastAnalytics: analytics });
}
