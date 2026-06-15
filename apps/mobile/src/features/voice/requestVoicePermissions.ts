import { Platform, Linking, PermissionsAndroid } from 'react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export async function getMicPermissionStatus(): Promise<PermissionStatus> {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return 'granted';
  if (current.canAskAgain === false) return 'denied';
  return 'undetermined';
}

export async function requestMicPermission(): Promise<PermissionStatus> {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return 'granted';

  const result = await requestRecordingPermissionsAsync();
  return result.granted ? 'granted' : 'denied';
}

export async function requireMicPermission(): Promise<void> {
  const status = await requestMicPermission();
  if (status !== 'granted') {
    throw new Error('Microphone permission is required');
  }
}

export async function requestNotificationPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android' || Platform.Version < 33) {
    return 'granted';
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
}

export async function openAppSettings() {
  await Linking.openSettings();
}
