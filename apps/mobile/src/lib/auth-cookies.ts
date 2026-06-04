import { getCookie, getSetCookie } from '@better-auth/expo/client';
import { authClient, readBetterAuthStoredSession } from '@/lib/auth-client';
import { authStorage, deleteItemAsync } from '@/lib/secure-storage';

export const AUTH_COOKIE_STORAGE_KEY = 'ai-assistant_cookie';

export function getAuthCookie(): string {
  const fromClient =
    typeof authClient.getCookie === 'function' ? authClient.getCookie() : '';
  if (fromClient) return fromClient;

  const stored = authStorage.getItem(AUTH_COOKIE_STORAGE_KEY);
  if (!stored) return '';
  return getCookie(stored) ?? '';
}

export function sessionTokenFromCookie(cookie: string): string | null {
  const match = cookie.match(/better-auth\.session_token=([^;]+)/);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function getAuthSessionToken(): string | undefined {
  const fromCookie = sessionTokenFromCookie(getAuthCookie());
  if (fromCookie) return fromCookie;

  const stored = readBetterAuthStoredSession();
  return stored?.session?.token;
}

export function getSocketSessionToken(): string | undefined {
  return getAuthSessionToken();
}

export function hasAuthCredentials(): boolean {
  return Boolean(getAuthCookie() || getAuthSessionToken());
}

export async function clearAuthCookie(): Promise<void> {
  await deleteItemAsync(AUTH_COOKIE_STORAGE_KEY);
}

function decodeCookieParam(raw: string): string {
  let value = raw;
  for (let i = 0; i < 4; i++) {
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch {
      break;
    }
  }
  return value;
}

export async function applyOAuthCookieFromUrl(
  url: string | null | undefined
): Promise<boolean> {
  if (!url) return false;
  try {
    const cookieParam = new URL(url).searchParams.get('cookie');
    if (!cookieParam) return false;

    const decoded = decodeCookieParam(cookieParam);
    const prev = authStorage.getItem(AUTH_COOKIE_STORAGE_KEY);
    const next = getSetCookie(decoded, prev ?? undefined);
    authStorage.setItem(AUTH_COOKIE_STORAGE_KEY, next);
    return Boolean(getCookie(next));
  } catch {
    return false;
  }
}

export async function applyOAuthCookieParam(
  cookieParam: string | null | undefined
): Promise<boolean> {
  if (!cookieParam) return false;
  const decoded = decodeCookieParam(cookieParam);
  const prev = authStorage.getItem(AUTH_COOKIE_STORAGE_KEY);
  const next = getSetCookie(decoded, prev ?? undefined);
  authStorage.setItem(AUTH_COOKIE_STORAGE_KEY, next);
  return Boolean(getCookie(next));
}
