import { type ReactNode } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { router } from 'expo-router';
import { useDrawerNavigation } from '@/hooks/useDrawerNavigation';
import {
  MessageSquare,
  Settings,
  Sparkles,
  Brain,
  Workflow,
  LogOut,
  Sun,
  Moon,
  Smartphone,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { spacing, radii } from '@/theme/tokens';
import { PressableScale } from '@/components/motion/PressableScale';
import { toggleOverlay } from '@/lib/overlay';
import type { ThemeMode } from '@/theme/tokens';
import Constants from 'expo-constants';

function NavRow({
  icon,
  label,
  onPress,
  disabled,
  badge,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} disabled={disabled}>
      <View style={[styles.navRow, disabled && { opacity: 0.45 }]}>
        {icon}
        <Text variant="bodyMedium" style={{ flex: 1 }}>
          {label}
        </Text>
        {badge ? (
          <Text variant="caption" muted>
            {badge}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

export function DrawerContent() {
  const { closeDrawer } = useDrawerNavigation();
  const { colors, mode, setMode } = useTheme();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const overlayEnabled = useSettingsStore((s) => s.overlayEnabled);
  const setOverlayEnabled = useSettingsStore((s) => s.setOverlayEnabled);

  const user = session?.user;
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?';

  const cycleTheme = () => {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(mode);
    setMode(order[(idx + 1) % order.length]);
  };

  const themeIcon =
    mode === 'dark' ? (
      <Moon color={colors.primary} size={20} />
    ) : mode === 'light' ? (
      <Sun color={colors.primary} size={20} />
    ) : (
      <Smartphone color={colors.primary} size={20} />
    );

  const onToggleOverlay = async () => {
    const next = !overlayEnabled;
    await setOverlayEnabled(next);
    if (next) {
      await toggleOverlay(true);
    } else {
      await toggleOverlay(false);
    }
  };

  return (
    <DrawerContentScrollView
      contentContainerStyle={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.profile, { borderBottomColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primaryMuted }]}>
          <Text variant="h2" style={{ color: colors.primary }}>
            {initial}
          </Text>
        </View>
        <Text variant="bodyMedium">{user?.name ?? 'Guest'}</Text>
        <Text variant="caption" muted>
          {user?.email}
        </Text>
      </View>

      <ScrollView style={styles.menu}>
        <NavRow
          icon={<MessageSquare color={colors.text} size={20} />}
          label="New chat"
          onPress={async () => {
            closeDrawer();
            const { apiClient } = await import('@/lib/api');
            const s = await apiClient.createSession('New Chat');
            router.push(`/(app)/chat/${s.id}`);
          }}
        />
        <NavRow
          icon={<Settings color={colors.text} size={20} />}
          label="Settings"
          onPress={() => {
            closeDrawer();
            router.push('/(app)/(main)/settings');
          }}
        />
        <NavRow
          icon={<Sparkles color={colors.text} size={20} />}
          label="Floating assistant"
          onPress={onToggleOverlay}
          badge={overlayEnabled ? 'On' : 'Off'}
        />
        <NavRow
          icon={themeIcon}
          label={`Theme: ${mode}`}
          onPress={cycleTheme}
        />
        <NavRow
          icon={<Brain color={colors.text} size={20} />}
          label="Memory"
          onPress={() => {}}
          disabled
          badge="Soon"
        />
        <NavRow
          icon={<Workflow color={colors.text} size={20} />}
          label="Automations"
          onPress={() => {}}
          disabled
          badge="Soon"
        />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={async () => {
            await signOut();
            router.replace('/(auth)/welcome');
          }}
          style={styles.signOut}>
          <LogOut color={colors.danger} size={18} />
          <Text variant="bodyMedium" style={{ color: colors.danger }}>
            Sign out
          </Text>
        </Pressable>
        <Text variant="caption" muted style={{ marginTop: spacing.sm }}>
          v{Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  profile: {
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  menu: { flex: 1, padding: spacing.md },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
