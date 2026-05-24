import * as SecureStore from 'expo-secure-store';
import { authClient } from '@/lib/auth-client';
import { apiClient, type SessionInfo } from '@/lib/api';

const SESSION_KEY = 'better-auth.session_token';

export async function syncSessionToApiClient(): Promise<SessionInfo | null> {
  const { data } = await authClient.getSession();
  const token = data?.session?.token;

  if (token) {
    await SecureStore.setItemAsync(SESSION_KEY, token);
    apiClient.setSessionCookie(`better-auth.session_token=${token}`);
  }

  return data ?? null;
}

export async function clearAllSessions(): Promise<void> {
  await authClient.signOut().catch(() => undefined);
  await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
  apiClient.setSessionCookie('');
  await apiClient.signOut().catch(() => undefined);
}
