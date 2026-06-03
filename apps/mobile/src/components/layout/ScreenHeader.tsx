import { type ReactNode, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Menu, MoreVertical, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { PressableScale } from '@/components/motion/PressableScale';
import { useDrawerNavigation } from '@/hooks/useDrawerNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { Routes } from '@/lib/routes';
import { prepareNewCompose } from '@/features/chat/chatSessionLifecycle';
import type { MenuAnchorRect } from '@/components/chat/ChatSessionActionsModal';

type ScreenHeaderVariant = 'chat' | 'page' | 'large';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  variant?: ScreenHeaderVariant;
  leading?: 'menu' | 'back' | ReactNode;
  trailing?: 'newChat' | 'more' | ReactNode | null;
  statusBadge?: string;
  onLeadingPress?: () => void;
  onTrailingPress?: (anchor: MenuAnchorRect) => void;
  titleAlign?: 'center' | 'left';
};

function IconPill({
  onPress,
  children,
  accessibilityLabel,
  measureOnPress,
}: {
  onPress?: () => void;
  measureOnPress?: (anchor: MenuAnchorRect) => void;
  children: ReactNode;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const ref = useRef<View>(null);

  const handlePress = () => {
    void Haptics.selectionAsync();
    if (measureOnPress) {
      ref.current?.measureInWindow((x, y, width, height) => {
        measureOnPress({ x, y, width, height });
      });
      return;
    }
    onPress?.();
  };

  return (
    <PressableScale
      onPress={handlePress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button">
      <View
        ref={ref}
        collapsable={false}
        style={[
          styles.iconPill,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}>
        {children}
      </View>
    </PressableScale>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  variant = 'page',
  leading = 'menu',
  trailing = null,
  statusBadge,
  onLeadingPress,
  onTrailingPress,
  titleAlign,
}: ScreenHeaderProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { openDrawer } = useDrawerNavigation();

  const alignedCenter =
    titleAlign ?? (leading !== 'back' && trailing != null ? 'center' : 'left');

  const handleLeading = () => {
    if (onLeadingPress) {
      onLeadingPress();
      return;
    }
    if (leading === 'back') {
      router.back();
      return;
    }
    openDrawer();
  };

  const handleNewChat = () => {
    prepareNewCompose();
    router.replace(Routes.chatCompose);
  };

  const titleVariant =
    variant === 'chat' ? 'bodyMedium' : variant === 'large' ? 'h2' : 'bodyMedium';

  const renderLeading = () => {
    if (typeof leading !== 'string') return leading;
    if (leading === 'back') {
      return (
        <IconPill onPress={handleLeading} accessibilityLabel="Go back">
          <ArrowLeft color={colors.text} size={20} />
        </IconPill>
      );
    }
    return (
      <IconPill onPress={handleLeading} accessibilityLabel="Open menu">
        <Menu color={colors.text} size={20} />
      </IconPill>
    );
  };

  const renderTrailing = () => {
    if (trailing === 'newChat') {
      return (
        <IconPill onPress={handleNewChat} accessibilityLabel="New chat">
          <Plus color={colors.primary} size={20} />
        </IconPill>
      );
    }
    if (trailing === 'more') {
      return (
        <IconPill
          measureOnPress={onTrailingPress}
          accessibilityLabel="Chat options">
          <MoreVertical color={colors.text} size={20} />
        </IconPill>
      );
    }
    if (trailing) return trailing;
    return <View style={styles.iconSlot} />;
  };

  const body = (
    <View
      style={[
        styles.inner,
        {
          paddingTop: insets.top + spacing.sm,
          paddingBottom: spacing.sm,
        },
      ]}>
      <View style={styles.sideSlot}>{renderLeading()}</View>

      <View
        style={[
          styles.titleBlock,
          alignedCenter ? styles.titleCenter : styles.titleLeft,
        ]}>
        <Text variant={titleVariant} numberOfLines={1} style={styles.titleText}>
          {title}
        </Text>
        {subtitle || statusBadge ? (
          <View style={styles.subtitleRow}>
            {subtitle ? (
              <Text variant="caption" muted numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Text>
            ) : null}
            {statusBadge ? (
              <View style={[styles.badge, { backgroundColor: colors.primaryMuted }]}>
                <Text variant="caption" style={{ color: colors.primary }}>
                  {statusBadge}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.sideSlot}>{renderTrailing()}</View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={40}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {body}
      <LinearGradient
        colors={[`${colors.border}80`, `${colors.background}00`]}
        style={styles.fadeSeparator}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  sideSlot: {
    width: 40,
    alignItems: 'center',
  },
  iconSlot: {
    width: 40,
    height: 40,
  },
  iconPill: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleCenter: {
    alignItems: 'center',
  },
  titleLeft: {
    alignItems: 'flex-start',
  },
  titleText: {
    maxWidth: '100%',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
  },
  subtitle: {
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  fadeSeparator: {
    height: 8,
    width: '100%',
  },
});
