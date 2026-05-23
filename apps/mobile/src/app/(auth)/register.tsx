import { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { MotiView } from 'moti';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { spacing } from '@/theme/tokens';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';

export default function RegisterScreen() {
  const signUp = useAuthStore((s) => s.signUp);
  const hasAcceptedTerms = useSettingsStore((s) => s.hasAcceptedTerms);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasAcceptedTerms()) {
      router.replace('/(auth)/terms');
    }
  }, [hasAcceptedTerms]);

  const onSubmit = async () => {
    if (!hasAcceptedTerms()) {
      router.push('/(auth)/terms');
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim() || 'User');
      router.replace('/(app)/(main)/chats');
    } catch (e) {
      Alert.alert('Registration failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        style={styles.form}>
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
      </MotiView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1, justifyContent: 'center' },
});
