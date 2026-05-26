import { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/tokens';

type Props = {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <View style={styles.wrap}>
      {icon}
      <Text variant="bodyMedium" style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text variant="caption" muted style={styles.desc}>
          {description}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 72,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  title: { textAlign: 'center', marginTop: spacing.sm },
  desc: { textAlign: 'center' },
  action: { marginTop: spacing.md, width: '100%', maxWidth: 280 },
});
