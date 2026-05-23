import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';
import { MessageSquare, Mic, Settings, Sparkles } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radii, spacing } from '@/theme/tokens';
import { useVoice } from '@/context/VoiceContext';
import type { MainTabBarProps } from '@/types/navigation';
import type { ThemeColors } from '@/theme/tokens';

const TABS = [
  { name: 'chats', label: 'Chats', Icon: MessageSquare },
  { name: 'assistant', label: 'Assistant', Icon: Sparkles },
  { name: 'settings', label: 'Settings', Icon: Settings },
] as const;

export function FloatingDockTabBar({ activeIndex, navigate }: MainTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { openVoiceSheet } = useVoice();

  return (
    <View
      style={[
        styles.wrapper,
        { paddingBottom: Math.max(insets.bottom, layout.dockBottomOffset) },
      ]}
      pointerEvents="box-none">
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          openVoiceSheet();
        }}
        style={[styles.micOuter, { shadowColor: colors.primary }]}>
        <View style={[styles.micBtn, { backgroundColor: colors.primary }]}>
          <Mic color={colors.onPrimary} size={28} />
        </View>
      </Pressable>

      <View style={styles.dockShadow}>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={80}
            tint={isDark ? 'dark' : 'light'}
            style={[styles.dock, { borderColor: colors.border }]}>
            <DockInner
              activeIndex={activeIndex}
              colors={colors}
              navigate={navigate}
            />
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
            <DockInner
              activeIndex={activeIndex}
              colors={colors}
              navigate={navigate}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function DockInner({
  activeIndex,
  colors,
  navigate,
}: {
  activeIndex: number;
  colors: ThemeColors;
  navigate: MainTabBarProps['navigate'];
}) {
  const tabWidth = 100 / TABS.length;

  return (
    <View style={styles.dockInner}>
      <MotiView
        animate={{ left: `${activeIndex * tabWidth}%` }}
        transition={{ type: 'spring', damping: 18, stiffness: 200 }}
        style={[
          styles.indicator,
          {
            width: `${tabWidth}%`,
            backgroundColor: colors.primaryMuted,
          },
        ]}
      />
      {TABS.map((tab, index) => {
        const focused = activeIndex === index;
        const Icon = tab.Icon;
        return (
          <Pressable
            key={tab.name}
            style={styles.tab}
            onPress={() => {
              void Haptics.selectionAsync();
              navigate(tab.name);
            }}>
            <Icon color={focused ? colors.primary : colors.textMuted} size={22} />
            <Text
              variant="caption"
              style={{
                color: focused ? colors.primary : colors.textMuted,
                marginTop: 2,
              }}>
              {tab.label}
            </Text>
          </Pressable>
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
  },
  dockShadow: {
    width: '92%',
    maxWidth: 420,
    borderRadius: radii.pill,
    overflow: 'hidden',
    elevation: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  dock: {
    borderRadius: radii.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dockInner: {
    flexDirection: 'row',
    height: layout.dockHeight,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    borderRadius: radii.pill,
    marginHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  micOuter: {
    position: 'absolute',
    top: -28,
    zIndex: 10,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  micBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
