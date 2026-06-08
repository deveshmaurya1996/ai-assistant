import type { SessionInfo } from '@ai-assistant/sdk';
import { fetchSession, readBetterAuthStoredSession } from '@/lib/auth-client';
import { hasAuthCredentials } from '@/lib/auth-cookies';
import { hydrateAuthStorage } from '@/lib/secure-storage';

export async function fetchVerifiedSession(): Promise<SessionInfo | null> {
  await hydrateAuthStorage();

  const fromApi = await fetchSession();
  if (fromApi?.session?.token) {
    return fromApi;
  }

  const stored = readBetterAuthStoredSession();
  if (stored?.session?.token && hasAuthCredentials()) {
    return stored;
  }

  return null;
}

export async function fetchVerifiedSessionWithRetry(
  maxAttempts = 12,
  delayMs = 350
): Promise<SessionInfo | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const session = await fetchVerifiedSession();
    if (session) return session;

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}
