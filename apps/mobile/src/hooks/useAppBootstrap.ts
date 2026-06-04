import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';

export function useAppBootstrap(fontsLoaded: boolean) {
  const [ready, setReady] = useState(false);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    if (!fontsLoaded) {
      setReady(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      await hydrateAuth();
      if (cancelled) return;
      await hydrateSettings();
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [fontsLoaded, hydrateAuth, hydrateSettings]);

  return ready;
}
