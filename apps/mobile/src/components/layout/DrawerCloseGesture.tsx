import { type ReactNode, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';

const SWIPE_DISTANCE = 56;
const SWIPE_VELOCITY = 500;

type DrawerCloseGestureProps = {
  children: ReactNode;
  onClose: () => void;
};

export function DrawerCloseGesture({ children, onClose }: DrawerCloseGestureProps) {
  const handlePanEnd = useCallback(
    (translationX: number, velocityX: number) => {
      const swipeLeft = translationX <= -SWIPE_DISTANCE || velocityX <= -SWIPE_VELOCITY;
      if (!swipeLeft) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onClose();
    },
    [onClose]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(-24)
        .failOffsetY([-16, 16])
        .onEnd((event) => {
          'worklet';
          scheduleOnRN(handlePanEnd, event.translationX, event.velocityX);
        }),
    [handlePanEnd]
  );

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.fill}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
