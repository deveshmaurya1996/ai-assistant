import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { apiClient } from '@/lib/api-client';
import { runIncrementalPhotoSync } from './localFileSync';
import { isDeviceFilesSyncRunning } from './deviceFilesSyncStore';

const POLL_INTERVAL_MS = 5 * 60_000;
const MIN_SYNC_GAP_MS = 15 * 60_000;

function isStale(lastSyncAt: string | null | undefined): boolean {
  if (!lastSyncAt) return true;
  const elapsed = Date.now() - new Date(lastSyncAt).getTime();
  return elapsed >= MIN_SYNC_GAP_MS;
}

export function useDeviceFilesSync() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const maybeSync = useCallback(async () => {
    if (appStateRef.current !== 'active') return;
    if (isDeviceFilesSyncRunning()) return;

    try {
      const status = await apiClient.getDeviceFilesStatus();
      if (!status.connected || !status.config.syncEnabled) return;
      if (!status.config.enabledSources.includes('photos')) return;
      if (!isStale(status.lastSyncAt)) return;

      await runIncrementalPhotoSync({ since: status.lastSyncAt });
    } catch (err) {
      if (__DEV__) {
        console.warn('[device-files] background sync skipped:', err);
      }
    }
  }, []);

  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      appStateRef.current = next;
      if (next === 'active') {
        void maybeSync();
      }
    };

    const sub = AppState.addEventListener('change', onAppStateChange);
    void maybeSync();

    pollTimerRef.current = setInterval(() => {
      void maybeSync();
    }, POLL_INTERVAL_MS);

    return () => {
      sub.remove();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [maybeSync]);
}
