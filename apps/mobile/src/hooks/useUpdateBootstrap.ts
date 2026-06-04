import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useEasUpdate } from '@/features/updates/useEasUpdate';

export function useUpdateBootstrap(fontsLoaded: boolean, storesReady: boolean) {
  const { runEasUpdate } = useEasUpdate();
  const [otaReady, setOtaReady] = useState(__DEV__ || Platform.OS === 'web');

  useEffect(() => {
    if (!fontsLoaded || !storesReady || otaReady) return;

    void (async () => {
      const reloaded = await runEasUpdate();
      if (!reloaded) setOtaReady(true);
    })();
  }, [fontsLoaded, storesReady, otaReady, runEasUpdate]);

  return otaReady;
}
