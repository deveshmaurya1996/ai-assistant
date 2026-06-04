import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findMonorepoRoot } from './load-env';

export type MobileReleaseManifest = {
  version: string;
  minVersion: string;
  androidVersionCode: number;
  minAndroidVersionCode: number;
  updatedAt?: string;
};

let cached: MobileReleaseManifest | null | undefined;

export function loadMobileReleaseManifest(): MobileReleaseManifest | null {
  if (cached !== undefined) return cached;
  const path = join(findMonorepoRoot(), 'apps/mobile/release-manifest.json');
  if (!existsSync(path)) {
    cached = null;
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as MobileReleaseManifest;
    cached = {
      version: raw.version ?? '1.0.0',
      minVersion: raw.minVersion ?? raw.version ?? '1.0.0',
      androidVersionCode: raw.androidVersionCode ?? 1,
      minAndroidVersionCode: raw.minAndroidVersionCode ?? raw.androidVersionCode ?? 1,
      updatedAt: raw.updatedAt,
    };
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export function clearMobileReleaseManifestCache(): void {
  cached = undefined;
}
