import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  color: string;
  size?: number;
  opacity?: number;
};

export function PulseRing({ color, size = 120, opacity: baseOpacity = 0.6 }: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(baseOpacity);
  const radius = size / 2;

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.2, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    opacity.value = withRepeat(
      withTiming(baseOpacity * 0.35, { duration: 800 }),
      -1,
      true
    );
  }, [baseOpacity, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.pulse,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  pulse: {
    position: 'absolute',
  },
});
