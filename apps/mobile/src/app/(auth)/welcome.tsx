import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { MotiView } from 'moti';
import { Sparkles } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export default function WelcomeScreen() {
  const { colors } = useTheme();

  return (
    <Screen style={styles.center}>
      <MotiView
        from={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring' }}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primaryMuted }]}>
          <Sparkles color={colors.primary} size={48} />
        </View>
      </MotiView>
      <MotiView
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ delay: 150 }}>
        <Text variant="h1" style={styles.title}>
          AI Assistant
        </Text>
        <Text variant="body" muted style={styles.sub}>
          Chat, voice, and memory — minimal by design.
        </Text>
      </MotiView>
      <MotiView
        from={{ opacity: 0, translateY: 24 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ delay: 300 }}
        style={styles.actions}>
        <Button label="Get started" onPress={() => router.push('/(auth)/terms')} />
        <Button
          label="Sign in"
          variant="secondary"
          onPress={() => router.push('/(auth)/login')}
        />
      </MotiView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: { textAlign: 'center', marginTop: spacing.lg },
  sub: { textAlign: 'center', marginTop: spacing.sm },
  actions: { gap: spacing.md, marginTop: spacing.xl },
});
