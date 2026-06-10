import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AssistantLogoMark } from '@/components/assistant/AssistantLogoMark';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { PulseRing } from '@/components/motion/PulseRing';
import { splashBackground, type ThemeColors } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

function resolveLogoColors(
  colors: ThemeColors,
  isDark: boolean,
  backgroundColor?: string,
  color?: string
) {
  return {
    markBackground: backgroundColor ?? (isDark ? splashBackground : colors.primaryMuted),
    logoColor: color ?? (isDark ? '#FFFFFF' : colors.primary),
  };
}

const DRAWER_SLOT = 28;
const LOGO_INSET_RATIO = 0.1;

type AssistantIconProps = {
  size?: number;
  inset?: number;
  backgroundColor?: string;
  color?: string;
  drawer?: boolean;
  animated?: boolean;
  hero?: boolean;
};

function Breathe({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!enabled) return;
    scale.value = withRepeat(
      withTiming(1.04, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [enabled, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!enabled) return <>{children}</>;
  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

function logoInset(size: number, padded: boolean, override?: number) {
  if (!padded) return 0;
  if (override !== undefined) return override;
  return Math.max(2, Math.round(size * LOGO_INSET_RATIO));
}

function LogoMark({
  size,
  padded = true,
  inset: insetOverride,
  backgroundColor = splashBackground,
  color = '#FFFFFF',
}: {
  size: number;
  padded?: boolean;
  inset?: number;
  backgroundColor?: string;
  color?: string;
}) {
  const inset = logoInset(size, padded, insetOverride);
  const logoSize = Math.max(8, size - inset * 2);

  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          padding: inset,
        },
      ]}>
      <AssistantLogoMark size={logoSize} color={color} />
    </View>
  );
}

export function AssistantIcon({
  size = 20,
  inset,
  backgroundColor,
  color,
  drawer = false,
  animated = false,
  hero = false,
}: AssistantIconProps) {
  const { colors, isDark } = useTheme();
  const { markBackground, logoColor } = resolveLogoColors(colors, isDark, backgroundColor, color);

  const mark = (
    <Breathe enabled={animated || hero}>
      <LogoMark size={size} inset={inset} backgroundColor={markBackground} color={logoColor} />
    </Breathe>
  );

  const core = hero ? (
    <View style={[styles.heroWrap, { width: size + 20, height: size + 20 }]}>
      <PulseRing color={colors.primary} size={size + 20} opacity={0.22} />
      <LinearGradient
        colors={[colors.primary, colors.primaryMuted]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroRing, { borderRadius: (size + 8) / 2, padding: 3 }]}>
        {mark}
      </LinearGradient>
    </View>
  ) : (
    mark
  );

  const icon = drawer ? (
    <View style={[styles.drawerSlot, { width: DRAWER_SLOT, height: DRAWER_SLOT }]}>{core}</View>
  ) : (
    core
  );

  if (hero) {
    return (
      <Animated.View entering={FadeIn.duration(400)} style={styles.heroAlign}>
        <Animated.View entering={ZoomIn.duration(500).springify().damping(14)}>
          {icon}
        </Animated.View>
      </Animated.View>
    );
  }

  return icon;
}

const SPLASH_LOAD_MS = 7000;
const SPLASH_EXIT_MS = 320;
const SPLASH_LOAD_GROW = 1.1;
const SPLASH_EXIT_SCALE = 1.65;

export function SplashLogo({
  size = 180,
  color = '#FFFFFF',
  ready = false,
  onExitComplete,
}: {
  size?: number;
  color?: string;
  ready?: boolean;
  onExitComplete?: () => void;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  const exitingRef = useRef(false);
  const mountedRef = useRef(false);
  const onExitCompleteRef = useRef(onExitComplete);
  onExitCompleteRef.current = onExitComplete;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) });
    scale.value = withTiming(SPLASH_LOAD_GROW, {
      duration: SPLASH_LOAD_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [opacity, scale]);

  useEffect(() => {
    if (!ready || exitingRef.current) return;
    exitingRef.current = true;

    opacity.value = withTiming(0, { duration: SPLASH_EXIT_MS, easing: Easing.in(Easing.cubic) });
    scale.value = withTiming(
      SPLASH_EXIT_SCALE,
      { duration: SPLASH_EXIT_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (!finished) return;
        scheduleOnRN(() => {
          if (mountedRef.current) {
            onExitCompleteRef.current?.();
          }
        });
      }
    );
  }, [ready, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <AssistantLogoMark size={size} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mark: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAlign: {
    alignSelf: 'center',
  },
});
