import { View, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { DrawerToggleButton } from '@react-navigation/drawer';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, spacing } from '@/theme/tokens';
import { PressableScale } from '@/components/motion/PressableScale';

type Props = {
  title: string;
  onNewChat?: () => void;
};

export function AppHeader({ title, onNewChat }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <View style={styles.menuSlot}>
        <DrawerToggleButton
          tintColor={colors.text}
          accessibilityLabel="Open menu"
        />
      </View>
      <Text variant="h2" style={styles.title}>
        {title}
      </Text>
      {onNewChat ? (
        <PressableScale onPress={onNewChat}>
          <Plus color={colors.primary} size={24} />
        </PressableScale>
      ) : (
        <View style={{ width: 24 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  menuSlot: {
    marginLeft: -spacing.sm,
  },
  title: { flex: 1 },
});
