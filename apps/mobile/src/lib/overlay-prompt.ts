import { Alert, Platform } from 'react-native';
import { canDrawOverlays, requestOverlayPermission } from './overlay';

export async function promptOverlayPermissionIfNeeded(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const granted = await canDrawOverlays();
  if (granted) return true;

  return new Promise((resolve) => {
    Alert.alert(
      'Display over other apps',
      'Allow overlay permission to show the floating assistant bubble while you use other apps.',
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Open settings',
          onPress: () => {
            void requestOverlayPermission();
            resolve(false);
          },
        },
      ]
    );
  });
}
