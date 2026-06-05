import { Switch, View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type Props = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
};

export function SwitchRow({ label, description, value, onValueChange, disabled }: Props) {
  const { colors, colorScheme } = useTheme();
  const thumbColor =
    colorScheme === 'dark'
      ? value
        ? '#0B0D10'
        : '#E5E7EB'
      : '#FFFFFF';
  const trackColor = {
    false: colorScheme === 'dark' ? '#3D4455' : '#CBD5E1',
    true: colors.primary,
  };

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="bodyMedium">{label}</Text>
        {description ? (
          <Text variant="caption" muted style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={trackColor}
        thumbColor={thumbColor}
        ios_backgroundColor={trackColor.false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  text: { flex: 1 },
});
