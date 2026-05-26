import { AssistantClient } from '@ai-assistant/sdk';
import { getAuthCookie } from '@/lib/auth-cookies';
import { API_URL } from './config';

export const apiClient = new AssistantClient(API_URL, API_URL);

apiClient.setAuthProvider(async () => {
  const cookie = getAuthCookie();
  return cookie ? { cookie } : null;
});
