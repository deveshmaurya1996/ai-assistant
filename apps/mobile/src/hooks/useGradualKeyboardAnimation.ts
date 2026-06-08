import { useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import { useSharedValue } from 'react-native-reanimated';

export function useGradualKeyboardAnimation() {
  const height = useSharedValue(0);
  const progress = useSharedValue(0);

  useGenericKeyboardHandler(
    {
      onMove: (event) => {
        'worklet';
        height.value = Math.max(event.height, 0);
        progress.value = event.progress;
      },
      onEnd: (event) => {
        'worklet';
        height.value = Math.max(event.height, 0);
        progress.value = event.progress;
      },
    },
    []
  );

  return { height, progress };
}
