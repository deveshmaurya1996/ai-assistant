import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppHeader } from '@/components/layout/AppHeader';
import { WhatsAppLinkScreen } from '@/components/integrations/WhatsAppLinkScreen';
import { spacing } from '@/theme/tokens';

const PROVIDER_NAMES: Record<string, string> = {
  google: 'Google',
  whatsapp: 'WhatsApp',
  files: 'Files',
};

export default function ProviderDetailScreen() {
  const { provider, connectionId } = useLocalSearchParams<{
    provider: string;
    connectionId?: string;
  }>();
  const router = useRouter();

  const displayName = PROVIDER_NAMES[provider ?? ''] ?? provider ?? 'Provider';

  if (provider === 'whatsapp' && connectionId) {
    return <WhatsAppLinkScreen connectionId={connectionId} />;
  }

  return (
    <Screen padded={false}>
      <AppHeader title={displayName} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <Text variant="body" muted>
            Follow the connection flow for {displayName}. If you opened a browser for sign-in,
            return here after approving access.
          </Text>
          <Button
            label="Done"
            variant="secondary"
            style={{ marginTop: spacing.lg }}
            onPress={() => router.back()}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.md,
    paddingBottom: 140,
  },
});
