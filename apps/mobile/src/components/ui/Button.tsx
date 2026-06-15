import { Pressable, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing } from '@/theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  labelColor?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  labelColor,
  disabled,
  loading,
  style,
}: Props) {
  const { colors } = useTheme();

  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.danger
        : variant === 'secondary'
          ? colors.surfaceElevated
          : 'transparent';

  const fg =
    labelColor ??
    (variant === 'primary' || variant === 'danger' ? colors.onPrimary : colors.text);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: colors.border,
          borderWidth: variant === 'secondary' ? 1 : 0,
          opacity: pressed ? 0.85 : disabled ? 0.5 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text variant="bodyMedium" style={{ color: fg, textAlign: 'center' }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
