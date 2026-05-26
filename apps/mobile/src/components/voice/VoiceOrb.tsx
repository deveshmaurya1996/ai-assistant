import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Mic } from 'lucide-react-native';
import type { DataPoint } from '@siteed/audio-studio';
import { VoiceEqualizer } from '@/components/voice/VoiceEqualizer';
import { useTheme } from '@/theme/ThemeProvider';

const SIZES = {
  sm: { outer: 44, barCount: 4, eqHeight: 20, barWidth: 3, gap: 4 },
  lg: { outer: 120, barCount: 5, eqHeight: 44, barWidth: 5, gap: 6 },
} as const;

export type VoiceOrbSize = keyof typeof SIZES;

type Props = {
  size?: VoiceOrbSize;
  isActive: boolean;
  dataPoints: DataPoint[];
  onPress?: () => void;
  disabled?: boolean;
  center?: 'mic' | 'equalizer' | 'spinner';
  style?: ViewStyle;
};

export function VoiceOrb({
  size = 'sm',
  isActive,
  dataPoints,
  onPress,
  disabled = false,
  center = 'mic',
  style,
}: Props) {
  const { colors } = useTheme();
  const spec = SIZES[size];
  const recording = isActive && center === 'equalizer';

  const centerNode = (() => {
    if (center === 'spinner') {
      return (
        <ActivityIndicator
          color={recording ? colors.onPrimary : colors.primary}
          size={size === 'lg' ? 'large' : 'small'}
        />
      );
    }
    if (center === 'equalizer') {
      return (
        <VoiceEqualizer
          dataPoints={dataPoints}
          barCount={spec.barCount}
          height={spec.eqHeight}
          barWidth={spec.barWidth}
          gap={spec.gap}
          color={recording ? colors.onPrimary : colors.primary}
          minLevel={0.14}
        />
      );
    }
    return <Mic color={colors.primary} size={size === 'lg' ? 40 : 20} />;
  })();

  const content = (
    <View
      style={[
        styles.root,
        {
          width: spec.outer,
          height: spec.outer,
          borderRadius: spec.outer / 2,
          backgroundColor: recording ? colors.primary : colors.primaryMuted,
        },
        style,
      ]}>
      {centerNode}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Start voice input'}
      style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.9 : 1 }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
