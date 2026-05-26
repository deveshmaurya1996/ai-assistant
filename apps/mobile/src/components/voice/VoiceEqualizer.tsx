import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { DataPoint } from '@siteed/audio-studio';
import { equalizerLevels } from '@/features/voice/studio/waveformDisplay';

const SPRING = { damping: 16, stiffness: 260, mass: 0.35 };

type BarProps = {
  level: number;
  barWidth: number;
  maxHeight: number;
  minHeight: number;
  color: string;
};

function EqualizerBar({ level, barWidth, maxHeight, minHeight, color }: BarProps) {
  const height = useSharedValue(minHeight);

  useEffect(() => {
    height.value = withSpring(minHeight + level * (maxHeight - minHeight), SPRING);
  }, [height, level, maxHeight, minHeight]);

  const style = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          width: barWidth,
          borderRadius: barWidth / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

type Props = {
  dataPoints: DataPoint[];
  barCount?: number;
  height?: number;
  barWidth?: number;
  gap?: number;
  color: string;
  minLevel?: number;
  style?: ViewStyle;
};

export function VoiceEqualizer({
  dataPoints,
  barCount = 5,
  height = 32,
  barWidth = 4,
  gap = 5,
  color,
  minLevel = 0.12,
  style,
}: Props) {
  const minHeight = 4;
  const maxHeight = height;

  const levels = useMemo(() => {
    const raw = equalizerLevels(dataPoints, barCount);
    return raw.map((l) => Math.max(minLevel, l));
  }, [barCount, dataPoints, minLevel]);

  return (
    <View style={[styles.row, { height, gap }, style]}>
      {levels.map((level, index) => (
        <EqualizerBar
          key={index}
          level={level}
          barWidth={barWidth}
          maxHeight={maxHeight}
          minHeight={minHeight}
          color={color}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bar: {
    alignSelf: 'flex-end',
  },
});
