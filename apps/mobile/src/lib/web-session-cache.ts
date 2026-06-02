import { Platform } from 'react-native';
import type { SessionInfo } from '@ai-assistant/sdk';

const WEB_SESSION_CACHE_KEY = 'ai-assistant_web_session_cache';

export function readWebSessionCache(): SessionInfo | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(WEB_SESSION_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionInfo;
  } catch {
    return null;
  }
}

export function writeWebSessionCache(session: SessionInfo | null): void {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  if (!session) {
    localStorage.removeItem(WEB_SESSION_CACHE_KEY);
    return;
  }
  localStorage.setItem(WEB_SESSION_CACHE_KEY, JSON.stringify(session));
}
