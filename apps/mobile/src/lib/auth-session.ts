import { getCookie, getSetCookie } from '@better-auth/expo/client';
import type { SessionInfo } from '@ai-assistant/sdk';
import { authClient } from '@/lib/auth-client';
import { apiClient } from '@/lib/api-client';
import {
  deleteItemAsync,
  getItemAsync,
  hydrateAuthStorage,
  setItemAsync,
} from '@/lib/secure-storage';

export const AUTH_COOKIE_STORAGE_KEY = 'ai-assistant_cookie';
const SESSION_KEY = 'better-auth.session_token';
const SESSION_FETCH_MS = 8_000;

let cachedSession: SessionInfo | null = null;

function logAuth(step: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`[auth] ${step}:`, detail, error);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Auth request timed out')), ms)
    ),
  ]);
}

function sessionTokenFromCookieHeader(cookieHeader: string): string | null {
  const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
  return match?.[1]?.trim() ?? null;
}

function sessionTokenFromStoredJson(storedJson: string): string | null {
  try {
    const parsed = JSON.parse(storedJson) as Record<
      string,
      { value?: string } | undefined
    >;
    return (
      parsed['better-auth.session_token']?.value ??
      parsed['better-auth_session_token']?.value ??
      null
    );
  } catch (error) {
    logAuth('parseStoredCookieJson', error);
    return null;
  }
}

function decodeCookieParam(raw: string): string {
  let value = raw;
  for (let i = 0; i < 4; i++) {
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch (error) {
      logAuth('decodeCookieParam', error);
      break;
    }
  }
  return value;
}

async function readCookieHeaderFromStorage(): Promise<string> {
  await hydrateAuthStorage();
  const storedJson = (await getItemAsync(AUTH_COOKIE_STORAGE_KEY)) ?? '{}';
  const cookieHeader = getCookie(storedJson);
  if (cookieHeader) return cookieHeader;

  const token = await getItemAsync(SESSION_KEY);
  return token ? `better-auth.session_token=${token}` : '';
}

async function applyCookieToApiClient(cookieHeader: string): Promise<void> {
  apiClient.setSessionCookie(cookieHeader);
  if (!cookieHeader) return;

  const storedJson = (await getItemAsync(AUTH_COOKIE_STORAGE_KEY)) ?? '{}';
  const token =
    sessionTokenFromCookieHeader(cookieHeader) ??
    sessionTokenFromStoredJson(storedJson);
  if (token) await setItemAsync(SESSION_KEY, token);
}

async function syncStorageFromAuthClient(): Promise<void> {
  try {
    const { data } = await withTimeout(authClient.getSession(), SESSION_FETCH_MS);
    if (!data?.session?.token) return;
    await setItemAsync(SESSION_KEY, data.session.token);
    await applyCookieToApiClient(await readCookieHeaderFromStorage());
  } catch (error) {
    logAuth('syncStorageFromAuthClient', error);
  }
}

async function credentialsFromStorage(): Promise<{
  cookie: string;
  token?: string;
} | null> {
  const cookieHeader = await readCookieHeaderFromStorage();
  await applyCookieToApiClient(cookieHeader);

  const token =
    cachedSession?.session?.token ??
    apiClient.getSessionToken() ??
    sessionTokenFromCookieHeader(cookieHeader) ??
    undefined;

  const cookie =
    cookieHeader || (token ? `better-auth.session_token=${token}` : '');

  if (!cookie && !token) return null;
  return { cookie, token };
}

async function fetchApiSession(): Promise<SessionInfo | null> {
  try {
    return await withTimeout(apiClient.getSession(), SESSION_FETCH_MS);
  } catch (error) {
    logAuth('fetchApiSession', error);
    return null;
  }
}

async function persistOAuthCookieParam(cookieParam: string): Promise<boolean> {
  const decoded = decodeCookieParam(cookieParam);
  const prev = await getItemAsync(AUTH_COOKIE_STORAGE_KEY);
  const next = getSetCookie(decoded, prev ?? undefined);
  await setItemAsync(AUTH_COOKIE_STORAGE_KEY, next);
  await applyCookieToApiClient(getCookie(next));
  return true;
}

export const authSession = {
  getSocketToken(): string {
    return cachedSession?.session?.token ?? apiClient.getSessionToken() ?? '';
  },

  getSession(): SessionInfo | null {
    return cachedSession;
  },

  async refresh(): Promise<SessionInfo | null> {
    let cookieHeader = await readCookieHeaderFromStorage();
    await applyCookieToApiClient(cookieHeader);

    if (!cookieHeader) {
      cachedSession = null;
      return null;
    }

    let session = await fetchApiSession();

    if (!session?.session) {
      await syncStorageFromAuthClient();
      cookieHeader = await readCookieHeaderFromStorage();
      await applyCookieToApiClient(cookieHeader);
      session = await fetchApiSession();
    }

    console.log(
      `[auth] refresh: cookieLen=${cookieHeader.length} session=${Boolean(session?.session)}`
    );

    if (!session?.session) {
      console.warn('[auth] refresh: no valid session after API check');
      cachedSession = null;
      return null;
    }

    if (session.session.token) {
      await setItemAsync(SESSION_KEY, session.session.token);
    }

    cachedSession = session;
    return session;
  },

  getAuthCredentials(): Promise<{ cookie: string; token?: string } | null> {
    return credentialsFromStorage();
  },

  async applyOAuthCookieParam(
    cookieParam: string | null | undefined
  ): Promise<boolean> {
    if (!cookieParam) return false;
    return persistOAuthCookieParam(cookieParam);
  },

  async applyOAuthUrl(url: string | null | undefined): Promise<boolean> {
    if (!url) return false;
    try {
      const cookieParam = new URL(url).searchParams.get('cookie');
      if (!cookieParam) return false;
      return persistOAuthCookieParam(cookieParam);
    } catch (error) {
      logAuth('applyOAuthUrl', error);
      return false;
    }
  },

  async signOut(): Promise<void> {
    await authClient.signOut().catch((error) => logAuth('signOut.authClient', error));
    await deleteItemAsync(SESSION_KEY).catch((error) =>
      logAuth('signOut.sessionToken', error)
    );
    await deleteItemAsync(AUTH_COOKIE_STORAGE_KEY).catch((error) =>
      logAuth('signOut.cookieStorage', error)
    );
    await deleteItemAsync('ai-assistant_session_data').catch((error) =>
      logAuth('signOut.sessionData', error)
    );
    apiClient.setSessionCookie('');
    cachedSession = null;
    await apiClient.signOut().catch((error) => logAuth('signOut.apiClient', error));
  },
};

apiClient.setAuthProvider(() => credentialsFromStorage());
