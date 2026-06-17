import { useCallback, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Layers, MessageSquare } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { promptOverlayPermissionIfNeeded } from '@/lib/overlay-prompt';
import { isOverlayPermissionGranted } from '@/lib/overlay-settings';
import { useOverlaySessionStore } from '@/features/overlay/overlaySessionStore';
import { useSettingsStore } from '@/stores/settings';
import { spacing, radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  showChat: boolean;
  onShowChatChange: (value: boolean) => void;
  chatDisabled?: boolean;
  overlayDisabled?: boolean;
};

export function AssistantVoiceToolbar({
  showChat,
  onShowChatChange,
  chatDisabled,
  overlayDisabled,
}: Props) {
  const { colors } = useTheme();
  const voiceOverlayEnabled = useSettingsStore((s) => s.voiceOverlayEnabled);
  const setVoiceOverlayEnabled = useSettingsStore((s) => s.setVoiceOverlayEnabled);
  const setUserDismissed = useOverlaySessionStore((s) => s.setUserDismissed);
  const [overlayGranted, setOverlayGranted] = useState(false);

  const refreshOverlayPermission = useCallback(async () => {
    const granted = await isOverlayPermissionGranted();
    setOverlayGranted(granted);
    if (voiceOverlayEnabled && !granted) {
      await setVoiceOverlayEnabled(false);
    }
  }, [setVoiceOverlayEnabled, voiceOverlayEnabled]);

  useFocusEffect(
    useCallback(() => {
      void refreshOverlayPermission();
    }, [refreshOverlayPermission])
  );

  const overlayOn = voiceOverlayEnabled && overlayGranted;

  return (
    <View style={styles.row}>
      <ToolbarChip
        label="Chat"
        icon={<MessageSquare size={14} color={showChat ? colors.primary : colors.textMuted} />}
        active={showChat}
        disabled={chatDisabled}
        onPress={() => onShowChatChange(!showChat)}
      />
      {Platform.OS === 'android' ? (
        <ToolbarChip
          label="Overlay"
          icon={<Layers size={14} color={overlayOn ? colors.primary : colors.textMuted} />}
          active={overlayOn}
          disabled={overlayDisabled}
          onPress={async () => {
            if (overlayOn) {
              await setVoiceOverlayEnabled(false);
              return;
            }
            let granted = await isOverlayPermissionGranted();
            if (!granted) {
              await promptOverlayPermissionIfNeeded();
              granted = await isOverlayPermissionGranted();
            }
            if (!granted) return;
            setUserDismissed(false);
            await setVoiceOverlayEnabled(true);
          }}
        />
      ) : null}
    </View>
  );
}

function ToolbarChip({
  label,
  icon,
  active,
  disabled,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.chip,
        {
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? colors.primaryMuted : colors.surface,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: active, disabled: Boolean(disabled) }}
      accessibilityLabel={label}
    >
      {icon}
      <Text variant="caption" style={{ color: active ? colors.primary : colors.textMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
