import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { DataPoint } from '@siteed/audio-studio';
import { PressableScale } from '@/components/motion/PressableScale';
import { Text } from '@/components/ui/Text';
import { VoiceEqualizer } from '@/components/voice/VoiceEqualizer';
import { idleWaveformBars } from '@/features/voice/studio/idleBars';
import { useDockInset } from '@/hooks/useDockInset';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import type { VoiceAssistantPhase } from '@/features/voice-assistant/useVoiceAssistantSession';

const METER_HEIGHT = 64;
const METER_BAR_COUNT = 7;
const METER_BAR_WIDTH = 5;
const METER_BAR_GAP = 7;
const LISTENING_GAIN = 1.4;

function boostMeterPoints(points: DataPoint[]): DataPoint[] {
  return points.map((p) => {
    const amp = Math.min(1, (p.amplitude ?? p.rms ?? 0) * LISTENING_GAIN);
    return { ...p, amplitude: amp, rms: amp };
  });
}

type Props = {
  phase: VoiceAssistantPhase;
  meteringDataPoints: DataPoint[];
  onStop: () => void;
};

function phaseLabel(phase: VoiceAssistantPhase): string {
  switch (phase) {
    case 'listening':
      return 'Listening…';
    case 'transcribing':
      return 'Processing…';
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

export function AssistantActiveFooter({
  phase,
  meteringDataPoints,
  onStop,
}: Props) {
  const { colors } = useTheme();
  const { bottom: dockBottom } = useDockInset();

  const isListening = phase === 'listening';
  const isThinking = phase === 'transcribing' || phase === 'waiting_for_ai';
  const isSpeaking = phase === 'speaking';
  const meterPoints: DataPoint[] = useMemo(() => {
    if (isListening && meteringDataPoints.length > 0) {
      return boostMeterPoints(meteringDataPoints);
    }
    if (isSpeaking) {
      return idleWaveformBars(28, 0.38);
    }
    if (isThinking) {
      return idleWaveformBars(24, 0.18);
    }
    return [];
  }, [isListening, isSpeaking, isThinking, meteringDataPoints]);

  const showMeter =
    isListening || isThinking || isSpeaking || meterPoints.length > 0;

  return (
    <View
      style={[
        styles.footer,
        {
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          paddingBottom: dockBottom,
        },
      ]}>
      <Text variant="caption" muted style={styles.phase}>
        {phaseLabel(phase)}
      </Text>

      {showMeter ? (
        <View style={styles.meterSlot}>
          <VoiceEqualizer
            dataPoints={meterPoints}
            barCount={METER_BAR_COUNT}
            height={METER_HEIGHT}
            barWidth={METER_BAR_WIDTH}
            gap={METER_BAR_GAP}
            color={colors.primary}
            minLevel={isListening ? 0.1 : 0.16}
          />
        </View>
      ) : (
        <View style={{ height: METER_HEIGHT }} />
      )}

      <PressableScale onPress={onStop} style={styles.endWrap}>
        <View style={[styles.endBtn, { backgroundColor: colors.surfaceElevated }]}>
          <Text variant="caption" style={{ color: colors.danger }}>
            End conversation
          </Text>
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  phase: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  meterSlot: {
    height: METER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endWrap: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  endBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
});
