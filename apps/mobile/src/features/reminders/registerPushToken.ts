import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { ApiError } from '@ai-assistant/sdk';
import { apiClient } from '@/lib/api-client';
import { hasAuthCredentials } from '@/lib/auth-cookies';
import { getNotificationPermissionStatus } from './requestNotificationPermission';
import {
  clearPendingPushRegistration,
  getPendingPushRegistration,
  savePendingPushRegistration,
} from './pendingPushToken';
import { setReminderOverlayEnabledNative } from '@/lib/overlay';

type PushRegistration = {
  token: string;
  platform: 'ios' | 'android';
  reminderOverlayEnabled: boolean;
};

function isAuthError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 401 || err.status === 403;
  }
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return message.includes('unauthorized') || message.includes('forbidden');
}

async function acquireExpoPushToken(): Promise<string | null> {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('[push] missing EAS project id');
    return null;
  }
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

async function uploadPushRegistration({
  token,
  platform,
  reminderOverlayEnabled,
}: PushRegistration): Promise<void> {
  await apiClient.registerPushToken({
    token,
    platform,
    prefs: { reminderOverlayEnabled },
  });
  await setReminderOverlayEnabledNative(reminderOverlayEnabled);
}

async function tryRegisterWithServer(
  registration: PushRegistration
): Promise<'ok' | 'unauthorized' | 'failed'> {
  try {
    await uploadPushRegistration(registration);
    await clearPendingPushRegistration();
    return 'ok';
  } catch (err) {
    if (isAuthError(err)) {
      await savePendingPushRegistration({
        token: registration.token,
        platform: registration.platform,
        prefs: { reminderOverlayEnabled: registration.reminderOverlayEnabled },
      });
      return 'unauthorized';
    }
    console.warn(
      '[push] register failed:',
      err instanceof Error ? err.message : err
    );
    return 'failed';
  }
}

/** Upload a previously saved token after the user signs in. */
export async function flushPendingPushRegistration(): Promise<boolean> {
  const pending = await getPendingPushRegistration();
  if (!pending || !hasAuthCredentials()) return false;

  const result = await tryRegisterWithServer({
    token: pending.token,
    platform: pending.platform,
    reminderOverlayEnabled: pending.prefs?.reminderOverlayEnabled ?? false,
  });
  return result === 'ok';
}

export async function registerPushTokenIfNeeded(
  reminderOverlayEnabled = false
): Promise<void> {
  if (!hasAuthCredentials()) {
    return;
  }

  if (!Device.isDevice) {
    console.warn('[push] skipped — use a physical device for push tokens');
    return;
  }

  try {
    const permission = await getNotificationPermissionStatus();
    if (permission !== 'granted') {
      console.warn('[push] skipped — notification permission not granted');
      return;
    }

    const token = await acquireExpoPushToken();
    if (!token) return;

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const registration: PushRegistration = {
      token,
      platform,
      reminderOverlayEnabled,
    };

    const result = await tryRegisterWithServer(registration);
    if (result === 'unauthorized') {
      console.warn('[push] saved locally — will register after sign-in');
    }
  } catch (err) {
    console.warn(
      '[push] register failed:',
      err instanceof Error ? err.message : err
    );
  }
}
