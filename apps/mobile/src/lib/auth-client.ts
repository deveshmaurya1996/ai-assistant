import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as WebBrowser from 'expo-web-browser';
import type { SessionInfo } from '@ai-assistant/sdk';
import { API_URL } from './config';
import { authStorage } from '@/lib/secure-storage';

WebBrowser.maybeCompleteAuthSession();

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: 'ai-assistant',
      storagePrefix: 'ai-assistant',
      storage: authStorage,
      cookiePrefix: 'better-auth',
    }),
  ],
});

type BetterAuthSessionPayload = {
  user?: {
    id: string;
    email: string;
    name: string;
  };
  session?: {
    token: string;
  };
};

export function toSessionInfo(data: BetterAuthSessionPayload | null | undefined): SessionInfo | null {
  if (!data?.user || !data?.session?.token) return null;
  return {
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
    },
    session: {
      token: data.session.token,
    },
  };
}

export async function fetchSession(): Promise<SessionInfo | null> {
  const { data } = await authClient.getSession();
  return toSessionInfo(data);
}
