import { useEffect, type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { PulseRing } from '@/components/motion/PulseRing';
import { splashBackground } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const LOGO = require('../../../assets/images/logo-mark.png');
const DRAWER_SLOT = 28;
const LOGO_INSET_RATIO = 0.1;

type AssistantIconProps = {
  size?: number;
  inset?: number;
  backgroundColor?: string;
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
}: {
  size: number;
  padded?: boolean;
  inset?: number;
  backgroundColor?: string;
}) {
  const inset = logoInset(size, padded, insetOverride);

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
      <Image
        source={LOGO}
        style={styles.markImage}
        resizeMode="contain"
        accessibilityLabel="AI Assistant"
      />
    </View>
  );
}

export function AssistantIcon({
  size = 20,
  inset,
  backgroundColor,
  drawer = false,
  animated = false,
  hero = false,
}: AssistantIconProps) {
  const { colors } = useTheme();
  const markBackground = backgroundColor ?? splashBackground;

  const mark = (
    <Breathe enabled={animated || hero}>
      <LogoMark size={size} inset={inset} backgroundColor={markBackground} />
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

export function SplashLogo({ size = 300 }: { size?: number }) {
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
      withRepeat(
        withTiming(1.03, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <LogoMark size={size} padded={false} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mark: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markImage: {
    width: '100%',
    height: '100%',
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
