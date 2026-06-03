import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type PulseDotProps = {
  color: string;
  size?: number;
};

export function PulseDot({ color, size = 7 }: PulseDotProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.35, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [opacity, scale]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const radius = size / 2;

  return (
    <View
      style={[styles.wrap, { width: size + 6, height: size + 6 }]}
      accessibilityLabel="Generating response"
      accessibilityRole="progressbar">
      <Animated.View
        style={[
          styles.halo,
          {
            width: size + 4,
            height: size + 4,
            borderRadius: (size + 4) / 2,
            backgroundColor: color,
          },
          haloStyle,
        ]}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
  },
});
