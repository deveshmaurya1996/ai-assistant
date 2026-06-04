import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { typography } from '@/theme/tokens';

type Props = {
  color: string;
};

export function InlineStreamingCursor({ color }: Props) {
  const opacity = useSharedValue(1);
  const glow = useSharedValue(0.6);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 450, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 450, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 450 }),
        withTiming(0.5, { duration: 450 })
      ),
      -1,
      false
    );
  }, [glow, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    textShadowColor: color,
    textShadowRadius: 8 * glow.value,
    textShadowOffset: { width: 0, height: 0 },
  }));

  return (
    <Animated.Text style={[styles.cursor, { color }, style]}>|</Animated.Text>
  );
}

const styles = StyleSheet.create({
  cursor: {
    ...typography.body,
    fontWeight: '600',
  },
});
