import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { hasAuthCredentials } from '@/lib/auth-cookies';
import { setReminderOverlayEnabledNative } from '@/lib/overlay';
import { registerPushTokenIfNeeded } from '@/features/reminders/registerPushToken';

export function useAppBootstrap(fontsLoaded: boolean) {
  const [ready, setReady] = useState(false);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const reminderOverlayEnabled = useSettingsStore((s) => s.reminderOverlayEnabled);

  useEffect(() => {
    if (!fontsLoaded) {
      setReady(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await hydrateAuth();
        if (cancelled) return;
        await hydrateSettings();
        if (cancelled) return;
        if (Platform.OS === 'android') {
          await setReminderOverlayEnabledNative(reminderOverlayEnabled);
          if (hasAuthCredentials()) {
            await registerPushTokenIfNeeded(reminderOverlayEnabled);
          }
        }
      } catch (err) {
        console.warn(
          '[bootstrap] startup task failed:',
          err instanceof Error ? err.message : err
        );
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [fontsLoaded, hydrateAuth, hydrateSettings, reminderOverlayEnabled]);

  return ready;
}
