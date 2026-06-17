import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PressableScale } from '@/components/motion/PressableScale';
import { Text } from '@/components/ui/Text';
import { AssistantVoiceVisualizer } from '@/components/assistant/AssistantVoiceVisualizer';
import { useDockInset } from '@/hooks/useDockInset';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import type { VoiceAssistantPhase } from '@/features/voice-assistant/useVoiceAssistantSession';

type ActiveFooterProps = {
  phase: VoiceAssistantPhase;
  roomReady?: boolean;
  isActive?: boolean;
  onStop: () => void;
};

export type AssistantVoiceFooterProps = {
  isActive: boolean;
  phase: VoiceAssistantPhase;
  onStart: () => void;
  onStop: () => void;
};

function phaseLabel(phase: VoiceAssistantPhase): string {
  switch (phase) {
    case 'connecting':
      return 'Connecting…';
    case 'listening':
      return 'Listening…';
    case 'waiting_for_ai':
      return 'Thinking…';
    case 'speaking':
      return 'Speaking…';
    case 'stopping':
      return 'Ending…';
    default:
      return '';
  }
}

/** Start/stop control for the assistant voice screen. */
export function AssistantVoiceFooter({
  isActive,
  phase,
  onStart,
  onStop,
}: AssistantVoiceFooterProps) {
  const { colors } = useTheme();
  const { bottom: dockBottom } = useDockInset();
  const label = isActive ? phaseLabel(phase) : '';

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isActive) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <View
      style={[
        styles.footer,
        {
          paddingBottom: dockBottom + spacing.md,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
        },
      ]}
    >
      {label ? (
        <Text variant="caption" muted style={styles.status}>
          {label}
        </Text>
      ) : null}
      <PressableScale
        onPress={handlePress}
        style={[
          styles.primaryButton,
          { backgroundColor: isActive ? colors.danger : colors.primary },
        ]}
        accessibilityLabel={isActive ? 'Stop voice session' : 'Start voice session'}
      >
        <Text variant="label" style={styles.buttonLabel}>
          {isActive ? 'Stop' : 'Start'}
        </Text>
      </PressableScale>
    </View>
  );
}

export function AssistantActiveFooter({
  phase,
  roomReady = false,
  isActive = true,
  onStop,
}: ActiveFooterProps) {
  const { colors } = useTheme();
  const { bottom: dockBottom } = useDockInset();
  const label = phaseLabel(phase);

  return (
    <View
      style={[
        styles.footer,
        {
          paddingBottom: dockBottom + spacing.md,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      ]}
    >
      <AssistantVoiceVisualizer
        roomReady={roomReady}
        isActive={isActive}
        phase={phase}
      />
      {label ? (
        <Text variant="body" muted style={styles.status}>
          {label}
        </Text>
      ) : null}
      <PressableScale
        onPress={onStop}
        style={[styles.primaryButton, { backgroundColor: colors.danger }]}
        accessibilityLabel="Stop voice session"
      >
        <Text variant="label" style={styles.buttonLabel}>
          End
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  status: {
    textAlign: 'center',
  },
  primaryButton: {
    minWidth: 148,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  buttonLabel: {
    color: '#fff',
  },
});
