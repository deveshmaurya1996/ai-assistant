import { Alert } from 'react-native';
import { useVoiceSessionBridge } from './voiceSessionBridge';

export async function runWithVoiceSessionSlot(
  targetSessionId: string | null,
  action: () => Promise<void>
): Promise<boolean> {
  const { isActive, chatSessionId, requestStop } = useVoiceSessionBridge.getState();

  if (isActive && targetSessionId && chatSessionId !== targetSessionId) {
    return new Promise((resolve) => {
      Alert.alert(
        'Voice session in progress',
        'End your current voice session before starting another?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'End & continue',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                await requestStop();
                await action();
                resolve(true);
              })();
            },
          },
        ]
      );
    });
  }

  if (isActive && !targetSessionId && chatSessionId) {
    return new Promise((resolve) => {
      Alert.alert(
        'Voice session in progress',
        'End your current voice session before starting another?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'End & continue',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                await requestStop();
                await action();
                resolve(true);
              })();
            },
          },
        ]
      );
    });
  }

  await action();
  return true;
}
