import { Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/Text';
import { radii, spacing } from '@/theme/tokens';

type Variant = 'connect' | 'disconnect';

type Props = {
  variant: Variant;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

const COLORS = {
  connect: { bg: '#16A34A', fg: '#FFFFFF' },
  disconnect: { bg: '#DC2626', fg: '#FFFFFF' },
} as const;

export function IntegrationActionButton({
  variant,
  label,
  onPress,
  disabled,
  loading,
}: Props) {
  const palette = COLORS[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: palette.bg,
          opacity: pressed ? 0.88 : disabled ? 0.5 : 1,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <Text variant="label" style={{ color: palette.fg }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minWidth: 88,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
  },
});
