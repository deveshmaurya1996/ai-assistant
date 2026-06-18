import { useEffect } from 'react';
import { Platform } from 'react-native';
import { getMicPermissionStatus, requestMicPermission } from '@/features/voice/requestVoicePermissions';
import { promptOverlayPermissionIfNeeded } from '@/lib/overlay-prompt';

export function useRequiredPermissions() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    void (async () => {
      // 1. Request microphone permission if undetermined
      const micStatus = await getMicPermissionStatus();
      if (micStatus === 'undetermined') {
        await requestMicPermission();
      }

      // 2. Request overlay permission if not granted
      await promptOverlayPermissionIfNeeded();
    })();
  }, []);
}
