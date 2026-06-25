import { AssistantClient, type MobileVersionInfo } from '@ai-assistant/sdk';
import type { WhatsAppSessionStatus } from '@ai-assistant/types';
import { getAuthCookie, getAuthSessionToken } from '@/lib/auth-cookies';
import { API_URL } from './config';

export type { MobileVersionInfo };

export type WhatsAppPairingResponse = WhatsAppSessionStatus & {
  connectionId: string;
  pairingPhoneDisplay?: string;
};

export type AppApiClient = AssistantClient & {
  requestWhatsAppPairing(
    connectionId: string,
    phoneNumber: string,
    options?: { countryCode?: string; forceRefresh?: boolean }
  ): Promise<WhatsAppPairingResponse>;
};

export const apiClient = new AssistantClient(API_URL, API_URL) as AppApiClient;

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
