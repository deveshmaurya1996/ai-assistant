import { Platform } from 'react-native';
import { canDrawOverlays } from '@/lib/overlay';

export async function isOverlayPermissionGranted(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return canDrawOverlays();
}

export async function reconcileStoredOverlayEnabled(
  storedEnabled: boolean
): Promise<boolean> {
  if (!storedEnabled) return false;
  const granted = await isOverlayPermissionGranted();
  return granted ? true : false;
}
