import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing } from '@/theme/tokens';
import type { ConnectionStatus } from '@ai-assistant/types';

const LABELS: Record<ConnectionStatus, string> = {
  ACTIVE: 'Connected',
  PENDING: 'Pending',
  ERROR: 'Error',
  DISCONNECTED: 'Not connected',
};

type Props = {
  status: ConnectionStatus | 'DISCONNECTED';
};

export function StatusBadge({ status }: Props) {
  const { colors } = useTheme();

  const tone =
    status === 'ACTIVE'
      ? { bg: `${colors.success}22`, fg: colors.success }
      : status === 'PENDING'
        ? { bg: `${colors.primary}22`, fg: colors.primary }
        : status === 'ERROR'
          ? { bg: `${colors.danger}22`, fg: colors.danger }
          : { bg: colors.surfaceElevated, fg: colors.textMuted };

  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <View style={[styles.dot, { backgroundColor: tone.fg }]} />
      <Text variant="label" style={{ color: tone.fg }}>
        {LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.full,
  },
});
