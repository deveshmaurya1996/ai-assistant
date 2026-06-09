import { useState, useEffect } from 'react';
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
import { useSettingsStore } from '@/stores/settings';
import { Routes } from '@/lib/routes';

export default function RegisterScreen() {
  const signUp = useAuthStore((s) => s.signUp);
  const ensureAuthenticated = useAuthStore((s) => s.ensureAuthenticated);
  const termsAcceptedAt = useSettingsStore((s) => s.termsAcceptedAt);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!termsAcceptedAt) {
      router.replace('/(auth)/terms');
    }
  }, [hydrated, termsAcceptedAt]);

  const onSubmit = async () => {
    if (!termsAcceptedAt) {
      router.replace('/(auth)/terms');
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim() || 'User');
      const ok = await ensureAuthenticated();
      if (!ok) {
        throw new Error('Could not verify your session. Try again.');
      }
      router.replace(Routes.chatCompose);
    } catch (e) {
      Alert.alert('Registration failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen safeTop>
      <FadeIn style={styles.form}>
        <Text variant="h1">Create account</Text>
        <Input placeholder="Name" value={name} onChangeText={setName} style={{ marginTop: spacing.lg }} />
        <Input
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{ marginTop: spacing.md }}
        />
        <Input
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={{ marginTop: spacing.md }}
        />
        <Button
          label={loading ? 'Creating…' : 'Sign up'}
          onPress={onSubmit}
          loading={loading}
          style={{ marginTop: spacing.lg }}
        />
        <GoogleSignInButton requireTermsAccepted />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1, justifyContent: 'center' },
});
