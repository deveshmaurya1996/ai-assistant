import Constants from 'expo-constants';

const DEFAULT_API_URL = 'http://10.0.2.2:3000';

function readApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv;

  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  if (typeof fromExtra === 'string' && fromExtra.length > 0) {
    return fromExtra;
  }

  return DEFAULT_API_URL;
}


export const API_URL = readApiUrl();

export const AUTH_CALLBACK_URL = 'ai-assistant://auth/callback';
