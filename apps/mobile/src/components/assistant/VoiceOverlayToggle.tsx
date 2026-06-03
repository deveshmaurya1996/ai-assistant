import { Platform, StyleSheet, View } from 'react-native';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { canDrawOverlays } from '@/lib/overlay';
import { promptOverlayPermissionIfNeeded } from '@/lib/overlay-prompt';
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
        value={voiceOverlayEnabled}
        disabled={disabled}
        onValueChange={async (enabled) => {
          if (enabled) {
            const granted = await canDrawOverlays();
            if (!granted) {
              await promptOverlayPermissionIfNeeded();
            }
            setUserDismissed(false);
          }
          await setVoiceOverlayEnabled(enabled);
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
