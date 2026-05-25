import Constants from 'expo-constants';

const DEFAULT_API_PORT = 3000;
const DEV_API_HOST = 'localhost';

function getApiPort(): number {
  const raw = process.env.EXPO_PUBLIC_API_PORT?.trim();
  if (!raw) return DEFAULT_API_PORT;
  const port = Number(raw);
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_API_PORT;
}

function readApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit;

  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  if (typeof fromExtra === 'string' && fromExtra.length > 0) {
    return fromExtra;
  }

  return `http://${DEV_API_HOST}:${getApiPort()}`;
}

export const API_URL = readApiUrl();

export const AUTH_CALLBACK_URL = 'ai-assistant://auth/callback';

export const GOOGLE_AUTH_ENABLED =
  process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED !== 'false';
