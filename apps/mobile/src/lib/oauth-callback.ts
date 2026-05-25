import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { API_URL } from './config';

const MOBILE_SCHEME = 'ai-assistant';

export function getOAuthFinalCallbackURL(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  return Linking.createURL('/auth/callback', { scheme: MOBILE_SCHEME });
}

export function getOAuthCallbackURL(): string {
  if (Platform.OS === 'web') {
    const returnTo = encodeURIComponent(getOAuthFinalCallbackURL());
    const api = new URL(API_URL);
    return `${api.origin}/auth/callback?return_to=${returnTo}`;
  }
  return getOAuthFinalCallbackURL();
}
