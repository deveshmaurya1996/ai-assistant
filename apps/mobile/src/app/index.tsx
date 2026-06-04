import { useEffect } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { AppSplash } from '@/components/boot/AppSplash';

import { Routes } from '@/lib/routes';

export default function Index() {
  const { session } = useAuthStore();
  const settingsReady = useSettingsStore((s) => s.hydrated);
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key || !settingsReady) return;

    if (session) {
      router.replace(Routes.chatCompose);
    } else {
      router.replace('/(auth)/welcome');
    }
  }, [navigationState?.key, settingsReady, session]);

  return <AppSplash />;
}
