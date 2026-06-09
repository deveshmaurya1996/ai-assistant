import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { AssistantIcon } from '@/components/assistant/AssistantIcon';
import { PressableScale } from '@/components/motion/PressableScale';
import { splashBackground } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const LOGO_SIZE = 112;
const HIT_SLOP = 8;
const ROTATION_MS = 18_000;

type Props = {
  assistantName: string;
  onPress: () => void;
};

function useBreathCycle(durationMs: number) {
  const phase = useSharedValue(0);

  useEffect(() => {
    phase.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.bezier(0.37, 0, 0.63, 1) }),
      -1,
      true
    );
  }, [durationMs, phase]);

  return phase;
}

export function AssistantStartButton({ assistantName, onPress }: Props) {
  const { colors, isDark } = useTheme();
  const containerSize = LOGO_SIZE + 56;

  const breathA = useBreathCycle(4200);
  const breathB = useBreathCycle(5600);
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(360, { duration: ROTATION_MS, easing: Easing.linear }),
      -1,
      false
    );
  }, [spin]);

  const glowStrength = isDark ? 0.26 : 0.18;

  const outerGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + breathB.value * glowStrength,
    transform: [{ scale: 1 + breathB.value * 0.14 }],
  }));

  const innerGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.1 + breathA.value * (glowStrength + 0.06),
    transform: [{ scale: 1 + breathA.value * 0.08 }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${spin.value}deg` },
      { scale: 1 + breathA.value * 0.028 },
    ],
  }));

  const handlePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }, [onPress]);

  return (
    <View style={[styles.wrap, { width: containerSize, height: containerSize }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            width: LOGO_SIZE + 40,
            height: LOGO_SIZE + 40,
            borderRadius: (LOGO_SIZE + 40) / 2,
            backgroundColor: colors.primary,
          },
          outerGlowStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            width: LOGO_SIZE + 20,
            height: LOGO_SIZE + 20,
            borderRadius: (LOGO_SIZE + 20) / 2,
            backgroundColor: colors.primaryMuted,
          },
          innerGlowStyle,
        ]}
      />
      <PressableScale
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Start voice conversation with ${assistantName}`}
        style={styles.pressable}>
        <Animated.View style={coreStyle}>
          <AssistantIcon
            size={LOGO_SIZE}
            inset={14}
            backgroundColor={splashBackground}
          />
        </Animated.View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  pressable: {
    padding: HIT_SLOP,
  },
});
