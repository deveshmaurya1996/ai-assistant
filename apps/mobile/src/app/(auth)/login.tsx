import { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { FadeIn } from '@/components/motion/FadeIn';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { spacing } from '@/theme/tokens';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useAuthStore } from '@/stores/auth';
import { Routes } from '@/lib/routes';

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const ensureAuthenticated = useAuthStore((s) => s.ensureAuthenticated);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      const ok = await ensureAuthenticated();
      if (!ok) {
        throw new Error('Could not verify your session. Try again.');
      }
      router.replace(Routes.chatCompose);
    } catch (e) {
      Alert.alert('Sign in failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen safeTop>
      <FadeIn style={styles.form}>
        <Text variant="h1">Welcome back</Text>
        <Text variant="body" muted style={{ marginBottom: spacing.lg }}>
          Sign in to continue
        </Text>
        <Input
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={{ marginTop: spacing.md }}
        />
        <Button
          label={loading ? 'Signing in…' : 'Sign in'}
          onPress={onSubmit}
          loading={loading}
          style={{ marginTop: spacing.lg }}
        />
        <GoogleSignInButton />
        <Button
          label="Create account"
          variant="ghost"
          onPress={() => router.push('/(auth)/terms')}
          style={{ marginTop: spacing.sm }}
        />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1, justifyContent: 'center', gap: spacing.sm },
});
