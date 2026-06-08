import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  width: number;
  height: number;
  fillWidth?: boolean;
  style?: ViewStyle;
};

export function ChatImageSkeleton({ width, height, fillWidth = false, style }: Props) {
  const { colors } = useTheme();
  const pulse = useSharedValue(0.35);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.75, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <View
      style={[
        fillWidth ? styles.fill : { width, height },
        fillWidth ? { height } : null,
        style,
      ]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.border },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    alignSelf: 'stretch',
  },
});
