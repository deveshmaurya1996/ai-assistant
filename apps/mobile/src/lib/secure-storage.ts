import { Platform } from 'react-native';
import type { AuthStorage } from './secure-storage.types';

export type { AuthStorage } from './secure-storage.types';

const AUTH_KEYS = ['ai-assistant_cookie', 'ai-assistant_session_data'] as const;

const webStorage: AuthStorage = {
  getItem(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
};

const memoryCache = new Map<string, string>();
let nativeHydrated = false;
let nativeHydratePromise: Promise<void> | null = null;

type NativeSecureStore = typeof import('expo-secure-store');

function loadNativeSecureStore(): NativeSecureStore {
  return require('expo-secure-store');
}

function writeNativeCache(key: string, value: string): void {
  memoryCache.set(key, value);
  void loadNativeSecureStore().setItemAsync(key, value);
}

const nativeAuthStorage: AuthStorage = {
  getItem(key: string): string | null {
    return memoryCache.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    writeNativeCache(key, value);
  },
};

export const authStorage: AuthStorage =
  Platform.OS === 'web' ? webStorage : nativeAuthStorage;

export async function hydrateAuthStorage(): Promise<void> {
  if (Platform.OS === 'web' || nativeHydrated) return;
  if (!nativeHydratePromise) {
    nativeHydratePromise = (async () => {
      const store = loadNativeSecureStore();
      await Promise.all(
        AUTH_KEYS.map(async (key) => {
          const value = await store.getItemAsync(key);
          if (value != null) memoryCache.set(key, value);
        })
      );
      nativeHydrated = true;
    })();
  }
  await nativeHydratePromise;
}

export function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return Promise.resolve(webStorage.getItem(key));
  }
  const cached = memoryCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  return loadNativeSecureStore().getItemAsync(key).then((value) => {
    if (value != null) memoryCache.set(key, value);
    return value;
  });
}

export function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage.setItem(key, value);
    return Promise.resolve();
  }
  writeNativeCache(key, value);
  return Promise.resolve();
}

export function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return Promise.resolve();
  }
  memoryCache.delete(key);
  return loadNativeSecureStore().deleteItemAsync(key);
}
