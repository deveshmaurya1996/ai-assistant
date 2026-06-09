import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { AssistantIcon } from '@/components/assistant/AssistantIcon';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/motion/FadeIn';
import { spacing } from '@/theme/tokens';

export default function WelcomeScreen() {
  return (
    <Screen safeTop style={styles.center}>
      <AssistantIcon size={96} animated hero />
      <FadeIn delay={150}>
        <Text variant="h1" style={styles.title}>
          AI Assistant
        </Text>
        <Text variant="body" muted style={styles.sub}>
          Chat, voice, and memory, minimal by design.
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
  title: { textAlign: 'center', marginTop: spacing.lg },
  sub: { textAlign: 'center', marginTop: spacing.sm },
  actions: { gap: spacing.md, marginTop: spacing.xl },
});
