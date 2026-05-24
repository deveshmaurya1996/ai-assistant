import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { API_URL } from './config';

WebBrowser.maybeCompleteAuthSession();

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: 'ai-assistant',
      storagePrefix: 'ai-assistant',
      storage: SecureStore,
      cookiePrefix: 'better-auth',
    }),
  ],
});
