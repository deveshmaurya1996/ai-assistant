import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Mic, Square } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  isRecording: boolean;
  isProcessing: boolean;
  disabled?: boolean;
  onPress: () => void;
  size?: number;
  variant?: 'composer' | 'hero';
};

export function VoiceMicButton({
  isRecording,
  isProcessing,
  disabled = false,
  onPress,
  size,
  variant = 'composer',
}: Props) {
  const { colors } = useTheme();
  const isHero = variant === 'hero';
  const buttonSize = size ?? (isHero ? 96 : 44);
  const iconSize = Math.round(buttonSize * (isHero ? 0.38 : 0.5));
  const isDisabled = disabled || isProcessing;
  const idleIconColor = isHero ? colors.onPrimary : colors.primary;
  const idleBg = isHero ? colors.primary : colors.primaryMuted;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={
        isProcessing
          ? 'Processing voice'
          : isRecording
            ? 'Stop recording'
            : isHero
              ? 'Start voice conversation'
              : 'Start voice input'
      }
      style={[
        styles.btn,
        {
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor: isRecording ? colors.primaryMuted : idleBg,
          opacity: isDisabled && !isProcessing ? 0.45 : 1,
        },
      ]}>
      {isProcessing ? (
        <ActivityIndicator color={isHero ? colors.onPrimary : colors.primary} size="small" />
      ) : isRecording ? (
        <Square color={colors.danger} size={iconSize} fill={colors.danger} />
      ) : (
        <Mic color={idleIconColor} size={iconSize} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
