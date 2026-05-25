import { View, StyleSheet } from 'react-native';
import { Mic, Square } from 'lucide-react-native';
import { PressableScale } from '@/components/motion/PressableScale';
import { PulseRing } from '@/components/motion/PulseRing';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import type { VoiceAssistantPhase } from '@/features/voice-assistant/useVoiceAssistantSession';
import { isVoiceIdleEndMessage } from '@/lib/format-ai-error';

type Props = {
  phase: VoiceAssistantPhase;
  statusMessage?: string | null;
  onStart: () => void;
  onStop: () => void;
};

function phaseLabel(phase: VoiceAssistantPhase): string {
  switch (phase) {
    case 'listening':
      return 'Listening…';
    case 'transcribing':
      return 'Processing speech…';
    case 'waiting_for_ai':
      return 'Thinking…';
    case 'speaking':
      return 'Speaking…';
    case 'stopping':
      return 'Ending…';
    case 'idle':
    default:
      return 'Tap to start voice chat';
  }
}

export function VoiceMicControl({ phase, statusMessage, onStart, onStop }: Props) {
  const { colors } = useTheme();
  const isActive = phase !== 'idle' && phase !== 'stopping';
  const isListening = phase === 'listening' || phase === 'transcribing';
  const idleEnd = statusMessage ? isVoiceIdleEndMessage(statusMessage) : false;

  return (
    <View style={styles.wrap}>
      {statusMessage ? (
        <Text
          variant="caption"
          muted={idleEnd}
          style={[
            styles.status,
            idleEnd ? undefined : { color: colors.danger },
          ]}>
          {statusMessage}
        </Text>
      ) : null}
      <Text variant="body" muted style={styles.label}>
        {isActive ? 'Tap mic to stop' : phaseLabel(phase)}
      </Text>
      <PressableScale onPress={isActive ? onStop : onStart}>
        <View style={styles.heroWrap}>
          {isListening ? <PulseRing color={colors.primary} /> : null}
          <View
            style={[
              styles.hero,
              {
                backgroundColor: isActive ? colors.danger : colors.primary,
              },
            ]}>
            {isActive ? (
              <Square color={colors.onPrimary} size={40} fill={colors.onPrimary} />
            ) : (
              <Mic color={colors.onPrimary} size={56} />
            )}
          </View>
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  status: {
    marginBottom: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  label: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  heroWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    width: 120,
    height: 120,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
