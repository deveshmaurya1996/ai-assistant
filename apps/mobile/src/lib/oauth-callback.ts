import { Platform } from 'react-native';
import { API_URL } from './config';

const MOBILE_SCHEME = 'ai-assistant';

const NATIVE_OAUTH_CALLBACK = `${MOBILE_SCHEME}://auth/callback`;

export function getOAuthFinalCallbackURL(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  return NATIVE_OAUTH_CALLBACK;
}

export function getOAuthCallbackURL(): string {
  if (Platform.OS !== 'web') {
    return getOAuthFinalCallbackURL();
  }
  const returnTo = encodeURIComponent(getOAuthFinalCallbackURL());
  const api = new URL(API_URL);
  return `${api.origin}/auth/callback?return_to=${returnTo}`;
}
