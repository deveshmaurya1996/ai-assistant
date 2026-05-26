import { View, StyleSheet, Platform } from 'react-native';
import { Menu, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useDrawerNavigation } from '@/hooks/useDrawerNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, spacing } from '@/theme/tokens';
import { PressableScale } from '@/components/motion/PressableScale';

type Props = {
  title: string;
  onNewChat?: () => void;
};

export function AppHeader({ title, onNewChat }: Props) {
  const { colors } = useTheme();
  const { openDrawer } = useDrawerNavigation();

  return (
    <View
      style={[
        styles.header,
        {
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 4,
            },
            android: { elevation: 1 },
            default: {},
          }),
        },
      ]}>
      <PressableScale
        onPress={openDrawer}
        accessibilityLabel="Open menu"
        style={styles.menuSlot}>
        <Menu color={colors.text} size={24} />
      </PressableScale>
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
