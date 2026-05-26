import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/motion/FadeIn';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export default function WelcomeScreen() {
  const { colors } = useTheme();

  return (
    <Screen style={styles.center}>
      <FadeIn>
        <LinearGradient
          colors={[colors.primary, colors.primaryMuted]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconGradient}>
          <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
            <Sparkles color={colors.primary} size={48} />
          </View>
        </LinearGradient>
      </FadeIn>
      <FadeIn delay={150}>
        <Text variant="h1" style={styles.title}>
          AI Assistant
        </Text>
        <Text variant="body" muted style={styles.sub}>
          Chat, voice, and memory — minimal by design.
        </Text>
      </FadeIn>
      <FadeIn delay={300} style={styles.actions}>
        <Button label="Get started" onPress={() => router.push('/(auth)/terms')} />
        <Button
          label="Sign in"
          variant="secondary"
          onPress={() => router.push('/(auth)/login')}
        />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  iconGradient: {
    padding: 3,
    borderRadius: 52,
    alignSelf: 'center',
  },
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
