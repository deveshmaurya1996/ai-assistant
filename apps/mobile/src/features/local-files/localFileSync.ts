import type { DeviceFilesSource } from '@ai-assistant/types';
import { isDeviceFilesSyncRunning, useDeviceFilesSyncStore } from './deviceFilesSyncStore';
import { runDeviceFileSync } from './syncEngine';
import type { LocalFileCandidate, LocalFileSyncProgress } from './types';

export type { LocalFileCandidate, LocalFileSyncProgress };

async function withSyncMutex<T>(fn: () => Promise<T>): Promise<T | null> {
  if (isDeviceFilesSyncRunning()) return null;
  const store = useDeviceFilesSyncStore.getState();
  store.setSyncInProgress(true);
  try {
    return await fn();
  } finally {
    store.setSyncInProgress(false);
    store.setProgress(null);
  }
}

export async function runLocalFileSync(params: {
  enabledSources: DeviceFilesSource[];
  since?: string | null;
  onProgress?: (progress: LocalFileSyncProgress) => void;
}): Promise<LocalFileSyncProgress> {
  const wrappedProgress = (progress: LocalFileSyncProgress) => {
    useDeviceFilesSyncStore.getState().setProgress(progress);
    params.onProgress?.(progress);
  };

  const result = await withSyncMutex(() =>
    runDeviceFileSync({
      mode: 'manual',
      enabledSources: params.enabledSources,
      since: params.since,
      onProgress: wrappedProgress,
    })
  );

  if (!result) {
    const blocked: LocalFileSyncProgress = {
      phase: 'error',
      message: 'Sync already in progress',
      uploaded: 0,
      skipped: 0,
      failed: 0,
      total: 0,
    };
    params.onProgress?.(blocked);
    return blocked;
  }

  return result;
}

export async function runIncrementalPhotoSync(params?: {
  since?: string | null;
  onProgress?: (progress: LocalFileSyncProgress) => void;
}): Promise<LocalFileSyncProgress | null> {
  const wrappedProgress = (progress: LocalFileSyncProgress) => {
    useDeviceFilesSyncStore.getState().setProgress(progress);
    params?.onProgress?.(progress);
  };

  return withSyncMutex(() =>
    runDeviceFileSync({
      mode: 'incremental',
      enabledSources: ['photos'],
      since: params?.since,
      onProgress: wrappedProgress,
    })
  );
}
