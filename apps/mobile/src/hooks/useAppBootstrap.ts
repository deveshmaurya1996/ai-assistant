import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
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
      await hydrateAuth();
      if (cancelled) return;
      await hydrateSettings();
      if (cancelled) return;
      if (Platform.OS === 'android') {
        await setReminderOverlayEnabledNative(reminderOverlayEnabled);
        await registerPushTokenIfNeeded(reminderOverlayEnabled);
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [fontsLoaded, hydrateAuth, hydrateSettings, reminderOverlayEnabled]);

  return ready;
}
