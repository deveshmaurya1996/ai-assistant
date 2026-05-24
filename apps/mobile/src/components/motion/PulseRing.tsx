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
};

export function PulseRing({ color }: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.2, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    opacity.value = withRepeat(withTiming(0.2, { duration: 800 }), -1, true);
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.pulse, { backgroundColor: color }, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  pulse: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
  },
});
