import { ApiError } from '@ai-assistant/sdk';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { clearApiAuth } from '@/lib/api-client';
import { clearAuthCookie } from '@/lib/auth-cookies';
import { writeWebSessionCache } from '@/lib/web-session-cache';
import { useChatSidebarStore } from '@/features/chat/chatSidebarStore';
import { useChatStreamStore } from '@/features/chat/chatStreamStore';
import { Routes } from '@/lib/routes';

let handling401 = false;

export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

export async function handleUnauthorizedApiError(err: unknown): Promise<boolean> {
  if (!isUnauthorizedError(err)) return false;
  if (handling401) return true;

  handling401 = true;
  try {
    writeWebSessionCache(null);
    await clearAuthCookie();
    clearApiAuth();
    useChatSidebarStore.getState().reset();
    useChatStreamStore.setState({ sessions: {}, boundTurnSessionId: null });
    useAuthStore.setState({ session: null, loading: false, hydrated: true });
    router.replace(Routes.welcome);
  } finally {
    handling401 = false;
  }
  return true;
}
