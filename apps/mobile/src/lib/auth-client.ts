import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { SessionInfo } from '@ai-assistant/sdk';
import { API_URL } from './config';
import { authStorage } from '@/lib/secure-storage';
import { readWebSessionCache, writeWebSessionCache } from '@/lib/web-session-cache';

WebBrowser.maybeCompleteAuthSession();

export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [
    expoClient({
      scheme: 'ai-assistant',
      storagePrefix: 'ai-assistant',
      storage: authStorage,
      cookiePrefix: 'better-auth',
    }),
  ],
});

type BetterAuthSessionPayload = {
  user?: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  };
  session?: {
    token: string;
  };
};

const AUTH_SESSION_DATA_KEY = 'ai-assistant_session_data';

export function readBetterAuthStoredSession(): SessionInfo | null {
  const raw = authStorage.getItem(AUTH_SESSION_DATA_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const payload =
      record.data && typeof record.data === 'object'
        ? (record.data as BetterAuthSessionPayload)
        : (parsed as BetterAuthSessionPayload);
    return toSessionInfo(payload);
  } catch {
    return null;
  }
}

export function readPersistedWebSession(): SessionInfo | null {
  return readWebSessionCache() ?? readBetterAuthStoredSession();
}

export function toSessionInfo(data: BetterAuthSessionPayload | null | undefined): SessionInfo | null {
  if (!data?.user || !data?.session?.token) return null;
  return {
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      image: data.user.image ?? null,
    },
    session: {
      token: data.session.token,
    },
  };
}

function isLikelyNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('failed to fetch') ||
      msg.includes('timeout')
    );
  }
  return false;
}

export async function fetchSession(): Promise<SessionInfo | null> {
  try {
    const { data } = await authClient.getSession();
    const session = toSessionInfo(data);
    if (session) {
      if (Platform.OS === 'web') writeWebSessionCache(session);
      return session;
    }
    if (Platform.OS === 'web') writeWebSessionCache(null);
    return null;
  } catch (err) {
    if (Platform.OS === 'web' && isLikelyNetworkError(err)) {
      return readPersistedWebSession();
    }
    if (Platform.OS === 'web') writeWebSessionCache(null);
    return null;
  }
}
