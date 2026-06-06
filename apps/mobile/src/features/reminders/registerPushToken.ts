import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from '@/lib/api-client';
import { requestNotificationPermission } from './requestNotificationPermission';
import { setReminderOverlayEnabledNative } from '@/lib/overlay';

export async function registerPushTokenIfNeeded(
  reminderOverlayEnabled = false
): Promise<void> {
  if (!Device.isDevice) {
    console.warn('[push] skipped — use a physical device for push tokens');
    return;
  }

  try {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.warn('[push] skipped — notification permission not granted');
      return;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[push] missing EAS project id');
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';

    await apiClient.registerPushToken({
      token: tokenData.data,
      platform,
      prefs: { reminderOverlayEnabled },
    });

    await setReminderOverlayEnabledNative(reminderOverlayEnabled);
  } catch (err) {
    console.warn(
      '[push] register failed:',
      err instanceof Error ? err.message : err
    );
  }
}
