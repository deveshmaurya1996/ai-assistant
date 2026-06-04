import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

export function getMarketingVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

export function getNativeBuildVersion(): string | null {
  if (Platform.OS === 'web') return null;
  return Application.nativeBuildVersion ?? null;
}

export function getAndroidVersionCode(): number | null {
  if (Platform.OS !== 'android') return null;
  const raw = Application.nativeBuildVersion;
  if (!raw) return null;
  const code = parseInt(raw, 10);
  return Number.isFinite(code) ? code : null;
}

export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .split('.')
      .map((part) => parseInt(part.replace(/[^0-9].*$/, ''), 10) || 0);
  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function formatVersionLabel(): string {
  const marketing = getMarketingVersion();
  const build = getNativeBuildVersion();
  if (!build || __DEV__) return marketing;
  return `${marketing} (${build})`;
}
