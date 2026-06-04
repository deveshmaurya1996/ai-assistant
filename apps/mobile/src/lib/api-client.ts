import { AssistantClient, type MobileVersionInfo } from '@ai-assistant/sdk';

export type { MobileVersionInfo };
import { getAuthCookie, getAuthSessionToken } from '@/lib/auth-cookies';
import { API_URL } from './config';

export const apiClient = new AssistantClient(API_URL, API_URL);

apiClient.setAuthProvider(async () => {
  const cookie = getAuthCookie();
  const token = getAuthSessionToken();
  if (!cookie && !token) return null;
  return { cookie, token };
});

export function clearApiAuth(): void {
  apiClient.clearAuth();
}

export function fileImageSource(fileId: string): { uri: string; headers?: { Cookie: string } } {
  const cookie = getAuthCookie();
  const token = getAuthSessionToken();
  const effectiveCookie =
    cookie ||
    (token ? `better-auth.session_token=${encodeURIComponent(token)}` : '');
  return {
    uri: apiClient.fileContentUrl(fileId, token),
    headers: effectiveCookie ? { Cookie: effectiveCookie } : undefined,
  };
}
