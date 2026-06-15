import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing } from '@/theme/tokens';
import type { ModelHealthState } from '@ai-assistant/types';

const LABELS: Record<ModelHealthState, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  warming: 'Warming',
  open: 'Unavailable',
  quarantined: 'Offline',
};

type Props = {
  state?: ModelHealthState;
  available?: boolean;
};

export function ModelHealthBadge({ state, available }: Props) {
  const { colors } = useTheme();
  const resolved = !available ? 'open' : state ?? 'warming';
  const tone =
    resolved === 'healthy'
      ? { bg: `${colors.success}22`, fg: colors.success }
      : resolved === 'degraded'
        ? { bg: `${colors.primary}22`, fg: colors.primary }
        : resolved === 'warming'
          ? { bg: `${colors.surfaceElevated}`, fg: colors.textMuted }
          : { bg: `${colors.danger}22`, fg: colors.danger };

  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <View style={[styles.dot, { backgroundColor: tone.fg }]} />
      <Text variant="label" style={{ color: tone.fg }}>
        {LABELS[resolved]}
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
