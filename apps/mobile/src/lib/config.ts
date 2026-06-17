import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_API_PORT = 3000;
const DEV_API_HOST = 'localhost';

function parsePortFromUrl(
  url: string | null | undefined,
  fallback = DEFAULT_API_PORT
): number {
  if (!url) return fallback;
  try {
    const parsed = new URL(url);
    if (parsed.port) {
      const port = Number(parsed.port);
      if (Number.isFinite(port) && port > 0) return port;
    }
    if (parsed.protocol === 'https:') return 443;
    if (parsed.protocol === 'http:') return 80;
  } catch {
    // ignore invalid URL
  }
  return fallback;
}

function getApiPort(): number {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return parsePortFromUrl(explicit);

  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  if (typeof fromExtra === 'string' && fromExtra.length > 0) {
    return parsePortFromUrl(fromExtra);
  }

  return DEFAULT_API_PORT;
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

export function resolveLiveKitUrlForDevice(url: string): string {
  if (!__DEV__ || Platform.OS === 'web') return url;
  if (!/localhost|127\.0\.0\.1/i.test(url)) return url;
  const lan = lanDevHost();
  if (!lan) return url;
  return url.replace(/localhost|127\.0\.0\.1/gi, lan);
}

export const AUTH_CALLBACK_URL = 'ai-assistant://auth/callback';

export const GOOGLE_AUTH_ENABLED =
  process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED !== 'false';
