import { LocalDiskStorage } from './adapters/local-disk';
import { R2Storage } from './adapters/r2';
import { loadStorageConfig } from './config';
import type { FileStorage } from './types';

let cached: FileStorage | null = null;

export function createFileStorage(config = loadStorageConfig()): FileStorage {
  if (config.backend === 'r2' && config.r2) {
    return new R2Storage(config.r2);
  }
  return new LocalDiskStorage(config.localRoot);
}

export function getFileStorage(): FileStorage {
  if (!cached) {
    cached = createFileStorage();
  }
  return cached;
}

export function resetFileStorageForTests(): void {
  cached = null;
}

export function getLocalDiskStorage(): LocalDiskStorage | null {
  const storage = getFileStorage();
  return storage instanceof LocalDiskStorage ? storage : null;
}
