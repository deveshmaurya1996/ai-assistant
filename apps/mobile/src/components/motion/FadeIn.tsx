import type { ReactNode } from 'react';
import { type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: ViewStyle;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(350)} style={style}>
      {children}
    </Animated.View>
  );
}
