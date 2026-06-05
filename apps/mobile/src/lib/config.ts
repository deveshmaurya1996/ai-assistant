import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_API_PORT = 3000;
const DEV_API_HOST = 'localhost';

function getApiPort(): number {
  const raw = process.env.EXPO_PUBLIC_API_PORT?.trim();
  if (!raw) return DEFAULT_API_PORT;
  const port = Number(raw);
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_API_PORT;
}

function lanDevHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0]?.trim();
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

function isLocalDevUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

function readApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  const extraUrl =
    typeof fromExtra === 'string' && fromExtra.length > 0 ? fromExtra : null;

  // OTA bundles can accidentally bake localhost from apps/mobile/.env during export.
  // In release builds, prefer the URL embedded in the native binary instead.
  if (explicit && (__DEV__ || !isLocalDevUrl(explicit))) {
    return explicit;
  }

  if (extraUrl) {
    return extraUrl;
  }

  const port = getApiPort();
  if (__DEV__ && Platform.OS !== 'web') {
    const lan = lanDevHost();
    if (lan) {
      return `http://${lan}:${port}`;
    }
  }

  return `http://${DEV_API_HOST}:${port}`;
}

export const API_URL = readApiUrl();

export const AUTH_CALLBACK_URL = 'ai-assistant://auth/callback';

export const GOOGLE_AUTH_ENABLED =
  process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED !== 'false';
