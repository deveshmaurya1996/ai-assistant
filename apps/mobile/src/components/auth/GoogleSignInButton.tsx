import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/tokens';
import { useAuthStore } from '@/stores/auth';
import { GOOGLE_AUTH_ENABLED } from '@/lib/config';
import { Routes } from '@/lib/routes';

export function GoogleSignInButton() {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const [loading, setLoading] = useState(false);

  if (!GOOGLE_AUTH_ENABLED) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text variant="caption" muted>
          or
        </Text>
        <View style={styles.dividerLine} />
      </View>
      <Button
        label={loading ? 'Connecting…' : 'Continue with Google'}
        variant="secondary"
        loading={loading}
        onPress={async () => {
          setLoading(true);
          try {
            await signInWithGoogle();
            router.replace(Routes.chatCompose);
          } catch (e) {
            Alert.alert(
              'Google sign-in failed',
              e instanceof Error ? e.message : 'Unknown error'
            );
          } finally {
            setLoading(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#9CA3AF',
  },
});
