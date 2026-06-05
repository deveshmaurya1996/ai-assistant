import { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { promptOverlayPermissionIfNeeded } from '@/lib/overlay-prompt';
import { isOverlayPermissionGranted } from '@/lib/overlay-settings';
import { useOverlaySessionStore } from '@/features/overlay/overlaySessionStore';
import { useSettingsStore } from '@/stores/settings';
import { spacing, radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  disabled?: boolean;
};

export function VoiceOverlayToggle({ disabled }: Props) {
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

  if (Platform.OS !== 'android') return null;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}>
      <SwitchRow
        label="Floating overlay"
        description="Show the assistant bubble on top of this screen while you talk"
        value={voiceOverlayEnabled && overlayGranted}
        disabled={disabled}
        onValueChange={async (enabled) => {
          if (enabled) {
            let granted = await isOverlayPermissionGranted();
            if (!granted) {
              await promptOverlayPermissionIfNeeded();
              granted = await isOverlayPermissionGranted();
            }
            if (!granted) return;
            setUserDismissed(false);
            await setVoiceOverlayEnabled(true);
            return;
          }
          await setVoiceOverlayEnabled(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
