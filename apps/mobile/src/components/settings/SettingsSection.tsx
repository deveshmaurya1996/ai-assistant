import { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { spacing } from '@/theme/tokens';

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <Text variant="label" muted style={styles.title}>
        {title}
      </Text>
      <Card>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg, gap: spacing.sm },
  title: { marginLeft: spacing.xs },
});
