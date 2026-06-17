import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { BarVisualizer } from '@livekit/react-native';
import {
  useLocalParticipant,
  useSpeakingParticipants,
  useVoiceAssistant,
} from '@livekit/components-react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { VoiceAssistantPhase } from '@/features/voice-assistant/useVoiceAssistantSession';

const VISUALIZER_HEIGHT = 88;
const SIDE_PADDING = spacing.lg * 2;

type Props = {
  roomReady: boolean;
  isActive: boolean;
  phase: VoiceAssistantPhase;
};

type ActivityMode = 'sleep' | 'connecting' | 'thinking' | 'user' | 'agent';

function useVisualizerLayout() {
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.max(240, screenWidth - SIDE_PADDING);
  const barCount = Math.min(48, Math.max(16, Math.floor(width / 12)));
  return { width, barCount };
}

function LiveKitBarVisualizer({
  width,
  barCount,
  phase,
}: {
  width: number;
  barCount: number;
  phase: VoiceAssistantPhase;
}) {
  const { colors } = useTheme();
  const { state, audioTrack } = useVoiceAssistant();
  const speaking = useSpeakingParticipants();
  const { localParticipant } = useLocalParticipant();
  const localSid = localParticipant?.sid;
  const userSpeaking = speaking.some((p) => p.sid === localSid);
  const remoteSpeaking = speaking.some((p) => p.sid !== localSid);

  const fallbackMode: ActivityMode =
    phase === 'connecting'
      ? 'connecting'
      : phase === 'waiting_for_ai'
        ? 'thinking'
        : userSpeaking
          ? 'user'
          : remoteSpeaking || phase === 'speaking'
            ? 'agent'
            : 'sleep';

  if (!audioTrack) {
    return (
      <IdleBarVisualizer
        mode={fallbackMode}
        width={width}
        barCount={barCount}
      />
    );
  }

  return (
    <View style={[styles.wrap, { width, height: VISUALIZER_HEIGHT }]}>
      <BarVisualizer
        state={state}
        trackRef={audioTrack}
        barCount={barCount}
        style={{ width, height: VISUALIZER_HEIGHT }}
        options={{
          minHeight: 0.12,
          maxHeight: 1,
          barWidth: Math.max(4, Math.floor((width / barCount) * 0.55)),
          barColor: colors.primary,
          barBorderRadius: 4,
        }}
      />
    </View>
  );
}

function IdleBar({
  index,
  mode,
  color,
  barWidth,
}: {
  index: number;
  mode: ActivityMode;
  color: string;
  barWidth: number;
}) {
  const barPulse = useSharedValue(0.2 + (index % 3) * 0.08);
  const active = mode !== 'sleep';
  const amplitude =
    mode === 'agent' ? 60 : mode === 'user' ? 54 : mode === 'thinking' ? 38 : mode === 'connecting' ? 28 : 16;

  useEffect(() => {
    barPulse.value = withRepeat(
      withTiming(active ? 0.55 + (index % 4) * 0.12 : 0.22 + (index % 2) * 0.06, {
        duration: 600 + index * 90,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [active, barPulse, index]);

  const style = useAnimatedStyle(() => ({
    height: 12 + barPulse.value * amplitude,
    opacity: active ? 0.35 + barPulse.value * 0.55 : 0.22 + barPulse.value * 0.28,
  }));

  return (
    <Animated.View
      style={[
        styles.idleBar,
        { backgroundColor: color, width: barWidth },
        style,
      ]}
    />
  );
}

function IdleBarVisualizer({
  mode,
  width,
  barCount,
}: {
  mode: ActivityMode;
  width: number;
  barCount: number;
}) {
  const { colors } = useTheme();
  const barWidth = Math.max(4, (width - (barCount - 1) * 6) / barCount);

  return (
    <View style={[styles.idleRow, { width, height: VISUALIZER_HEIGHT }]}>
      {Array.from({ length: barCount }, (_, i) => (
        <IdleBar
          key={i}
          index={i}
          mode={mode}
          color={colors.primary}
          barWidth={barWidth}
        />
      ))}
    </View>
  );
}

export function AssistantVoiceVisualizer({ roomReady, isActive, phase }: Props) {
  const { width, barCount } = useVisualizerLayout();
  const layout = useMemo(() => ({ width, barCount }), [width, barCount]);
  const idleMode: ActivityMode =
    !isActive
      ? 'sleep'
      : phase === 'connecting'
        ? 'connecting'
        : phase === 'waiting_for_ai'
          ? 'thinking'
          : phase === 'speaking'
            ? 'agent'
            : 'sleep';

  if (roomReady && isActive) {
    return (
      <LiveKitBarVisualizer
        width={layout.width}
        barCount={layout.barCount}
        phase={phase}
      />
    );
  }
  return (
    <IdleBarVisualizer
      mode={idleMode}
      width={layout.width}
      barCount={layout.barCount}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },
  idleBar: {
    borderRadius: 4,
  },
});
