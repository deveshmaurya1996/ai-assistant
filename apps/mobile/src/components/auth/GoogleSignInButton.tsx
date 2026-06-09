import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { ProviderIcon } from '@/components/integrations/ProviderIcon';
import { spacing, radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { GOOGLE_AUTH_ENABLED } from '@/lib/config';
import { Routes } from '@/lib/routes';

type Props = {
  requireTermsAccepted?: boolean;
};

export function GoogleSignInButton({ requireTermsAccepted = false }: Props) {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const ensureAuthenticated = useAuthStore((s) => s.ensureAuthenticated);
  const termsAcceptedAt = useSettingsStore((s) => s.termsAcceptedAt);
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);

  if (!GOOGLE_AUTH_ENABLED) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text variant="caption" muted>
          or
        </Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>
      <Pressable
        disabled={loading}
        onPress={async () => {
          if (requireTermsAccepted && !termsAcceptedAt) {
            router.replace('/(auth)/terms');
            return;
          }
          setLoading(true);
          try {
            await signInWithGoogle();
            let session = useAuthStore.getState().session;
            if (!session && Platform.OS === 'android') {
              session = await ensureAuthenticated()
                .then((ok) => (ok ? useAuthStore.getState().session : null))
                .catch(() => null);
            }
            if (session) {
              router.replace(Routes.chatCompose);
              return;
            }
            if (Platform.OS === 'web') {
              const ok = await ensureAuthenticated();
              if (!ok) {
                throw new Error('Could not verify your session. Try again.');
              }
              router.replace(Routes.chatCompose);
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            const cancelled =
              message.toLowerCase().includes('cancel') ||
              message.toLowerCase().includes('dismiss');
            if (!cancelled) {
              Alert.alert('Google sign-in failed', message);
            }
          } finally {
            setLoading(false);
          }
        }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            opacity: loading ? 0.6 : pressed ? 0.85 : 1,
          },
        ]}>
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <>
            <ProviderIcon providerId="google" size="xs" />
            <Text variant="bodyMedium">Continue with Google</Text>
          </>
        )}
      </Pressable>
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
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 48,
  },
});
