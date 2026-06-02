import { AssistantClient } from '@ai-assistant/sdk';
import { getAuthCookie, getAuthSessionToken } from '@/lib/auth-cookies';
import { API_URL } from './config';

export const apiClient = new AssistantClient(API_URL, API_URL);

apiClient.setAuthProvider(async () => {
  const cookie = getAuthCookie();
  const token = getAuthSessionToken();
  if (!cookie && !token) return null;
  return { cookie, token };
});

export function fileImageSource(fileId: string): { uri: string; headers?: { Cookie: string } } {
  const cookie = getAuthCookie();
  const token = getAuthSessionToken();
  return {
    uri: apiClient.fileContentUrl(fileId, token),
    headers: cookie ? { Cookie: cookie } : undefined,
  };
}
