import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  LayoutChangeEvent,
  type ColorValue,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MessageSquare, Settings, Sparkles } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  type AnimatedStyle,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import { Text } from '@/components/ui/Text';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radii } from '@/theme/tokens';
import type { MainTabBarProps } from '@/types/navigation';
import type { ThemeColors } from '@/theme/tokens';

const TABS = [
  { name: 'chats', label: 'Chats', Icon: MessageSquare },
  { name: 'assistant', label: 'Assistant', Icon: Sparkles },
  { name: 'settings', label: 'Settings', Icon: Settings },
] as const;

const TAB_COUNT = TABS.length;
const RING_WIDTH = 3;
const DOCK_H_PADDING = 6;
const INDICATOR_INSET = 4;

const SPRING = { damping: 18, stiffness: 220 };

function AnimatedGradientRing({
  colors,
  isDark,
}: {
  colors: ThemeColors;
  isDark: boolean;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 5000, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const gradientColors: readonly [ColorValue, ColorValue, ...ColorValue[]] = isDark
    ? [
        colors.primary,
        '#C4B5FD',
        colors.primaryMuted,
        'rgba(129, 140, 248, 0.4)',
        colors.primary,
      ]
    : [
        colors.primary,
        '#818CF8',
        colors.primaryMuted,
        'rgba(79, 70, 229, 0.35)',
        colors.primary,
      ];

  return (
    <Animated.View style={[styles.gradientSpinner, spinStyle]} pointerEvents="none">
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

export function FloatingDockTabBar({ activeIndex, navigate }: MainTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [innerWidth, setInnerWidth] = useState(0);
  const indicatorX = useSharedValue(0);

  const tabSlotWidth =
    innerWidth > 0
      ? (innerWidth - DOCK_H_PADDING * 2) / TAB_COUNT
      : 0;
  const indicatorWidth = Math.max(0, tabSlotWidth - INDICATOR_INSET * 2);

  useEffect(() => {
    if (tabSlotWidth <= 0) return;
    const targetX =
      DOCK_H_PADDING + activeIndex * tabSlotWidth + INDICATOR_INSET;
    indicatorX.value = withSpring(targetX, SPRING);
  }, [activeIndex, tabSlotWidth, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth,
  }));

  const onDockLayout = (e: LayoutChangeEvent) => {
    setInnerWidth(e.nativeEvent.layout.width);
  };

  const dockBody = (
    <DockInner
      activeIndex={activeIndex}
      colors={colors}
      navigate={navigate}
      indicatorStyle={indicatorStyle}
      onLayout={onDockLayout}
    />
  );

  return (
    <View
      style={[
        styles.wrapper,
        { paddingBottom: Math.max(insets.bottom, layout.dockBottomOffset) },
      ]}
      pointerEvents="box-none">
      <View style={styles.ringHost}>
        <AnimatedGradientRing colors={colors} isDark={isDark} />
        <View style={styles.ringInner}>
          {Platform.OS === 'ios' ? (
            <BlurView
              intensity={80}
              tint={isDark ? 'dark' : 'light'}
              style={[styles.dock, { borderColor: colors.border }]}>
              {dockBody}
            </BlurView>
          ) : (
            <View
              style={[
                styles.dock,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceElevated,
                },
              ]}>
              {dockBody}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function DockInner({
  activeIndex,
  colors,
  navigate,
  indicatorStyle,
  onLayout,
}: {
  activeIndex: number;
  colors: ThemeColors;
  navigate: MainTabBarProps['navigate'];
  indicatorStyle: AnimatedStyle<ViewStyle>;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  return (
    <View style={styles.dockInner} onLayout={onLayout}>
      <Animated.View
        style={[
          styles.indicator,
          { backgroundColor: colors.primaryMuted },
          indicatorStyle,
        ]}
      />
      {TABS.map((tab, index) => {
        const focused = activeIndex === index;
        const Icon = tab.Icon;
        return (
          <PressableScale
            key={tab.name}
            style={styles.tab}
            onPress={() => {
              void Haptics.selectionAsync();
              navigate(tab.name);
            }}>
            <Icon color={focused ? colors.primary : colors.textMuted} size={20} />
            <Text
              variant="caption"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[
                styles.tabLabel,
                { color: focused ? colors.primary : colors.textMuted },
              ]}>
              {tab.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  ringHost: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radii.pill + RING_WIDTH,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  gradientSpinner: {
    ...StyleSheet.absoluteFill,
    width: '220%',
    height: '220%',
    left: '-60%',
    top: '-60%',
  },
  ringInner: {
    margin: RING_WIDTH,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  dock: {
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dockInner: {
    flexDirection: 'row',
    height: layout.dockHeight,
    position: 'relative',
    paddingHorizontal: DOCK_H_PADDING,
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    top: INDICATOR_INSET,
    bottom: INDICATOR_INSET,
    left: 0,
    borderRadius: radii.pill,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 6,
    zIndex: 1,
  },
  tabLabel: {
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
  },
});
