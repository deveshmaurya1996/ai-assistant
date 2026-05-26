import { type ReactNode } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { DrawerColorIcon } from '@/components/layout/DrawerColorIcon';
import { Text } from '@/components/ui/Text';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { spacing } from '@/theme/tokens';
import { PressableScale } from '@/components/motion/PressableScale';
import { toggleOverlay } from '@/lib/overlay';
import { Routes } from '@/lib/routes';
import { useVoiceSessionBridge } from '@/features/voice-assistant/voiceSessionBridge';
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

type DrawerContentProps = {
  navigation: { closeDrawer: () => void };
};

export function DrawerContent({ navigation }: DrawerContentProps) {
  const insets = useSafeAreaInsets();
  const { colors, mode, setMode } = useTheme();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const overlayEnabled = useSettingsStore((s) => s.overlayEnabled);
  const setOverlayEnabled = useSettingsStore((s) => s.setOverlayEnabled);
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const voiceActive = useVoiceSessionBridge((s) => s.isActive);

  const user = session?.user;

  const cycleTheme = () => {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(mode);
    setMode(order[(idx + 1) % order.length]);
  };

  const themeIconName =
    mode === 'dark' ? 'themeDark' : mode === 'light' ? 'themeLight' : 'themeSystem';

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
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: colors.surface,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}>
      <View style={[styles.profile, { borderBottomColor: colors.border }]}>
        <View style={styles.avatarWrap}>
          <UserAvatar
            image={user?.image}
            name={user?.name}
            email={user?.email}
            size={48}
          />
        </View>
        <Text variant="bodyMedium">{user?.name ?? 'Guest'}</Text>
        <Text variant="caption" muted>
          {user?.email}
        </Text>
      </View>

      <ScrollView style={styles.menu}>
        <NavRow
          icon={<DrawerColorIcon name="newChat" drawer />}
          label="New chat"
          onPress={() => {
            navigation.closeDrawer();
            router.push(Routes.chatCompose);
          }}
        />
        <NavRow
          icon={<DrawerColorIcon name="assistant" drawer />}
          label={assistantDisplayName}
          onPress={() => {
            navigation.closeDrawer();
            router.push(Routes.assistant);
          }}
          badge={voiceActive ? 'Active' : undefined}
        />
        <NavRow
          icon={<DrawerColorIcon name="settings" drawer />}
          label="Settings"
          onPress={() => {
            navigation.closeDrawer();
            router.push(Routes.settings);
          }}
        />
        <NavRow
          icon={<DrawerColorIcon name="overlay" drawer />}
          label="Floating overlay"
          onPress={onToggleOverlay}
          badge={overlayEnabled ? 'On' : 'Off'}
        />
        <NavRow
          icon={<DrawerColorIcon name={themeIconName} drawer />}
          label={`Theme: ${mode}`}
          onPress={cycleTheme}
        />
        <NavRow
          icon={<DrawerColorIcon name="notes" drawer />}
          label="Notes"
          onPress={() => {
            navigation.closeDrawer();
            router.push(Routes.notes);
          }}
        />
        <NavRow
          icon={<DrawerColorIcon name="connectApps" drawer />}
          label="Connect Apps"
          onPress={() => {
            navigation.closeDrawer();
            router.push(Routes.integrations);
          }}
        />
        <NavRow
          icon={<DrawerColorIcon name="automations" drawer />}
          label="Automations"
          onPress={() => {
            navigation.closeDrawer();
            router.push(Routes.automations);
          }}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={async () => {
            await signOut();
            router.replace(Routes.welcome);
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profile: {
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  avatarWrap: {
    marginBottom: spacing.sm,
  },
  menu: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
