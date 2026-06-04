import { useCallback, useState } from 'react';
import * as Updates from 'expo-updates';

export type EasUpdateStatus = 'idle' | 'skipped' | 'checking' | 'downloading' | 'reloading' | 'done' | 'error';

export function useEasUpdate() {
  const [status, setStatus] = useState<EasUpdateStatus>('idle');

  const runEasUpdate = useCallback(async (): Promise<boolean> => {
    if (__DEV__ || !Updates.isEnabled) {
      setStatus('skipped');
      return false;
    }

    try {
      setStatus('checking');
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        setStatus('done');
        return false;
      }

      setStatus('downloading');
      await Updates.fetchUpdateAsync();
      setStatus('reloading');
      await Updates.reloadAsync();
      return true;
    } catch {
      setStatus('error');
      return false;
    }
  }, []);

  return { status, runEasUpdate };
}
