import { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Linking,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { ApiError } from '@ai-assistant/sdk';
import { useRouter, useFocusEffect } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppHeader } from '@/components/layout/AppHeader';
import { DrawerColorIcon } from '@/components/layout/DrawerColorIcon';
import { FadeIn } from '@/components/motion/FadeIn';
import { ProviderIcon } from '@/components/integrations/ProviderIcon';
import { IntegrationActionButton } from '@/components/integrations/IntegrationActionButton';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { apiClient } from '@/lib/api-client';
import { integrationProviderRoute } from '@/lib/routes';
import type { UserConnection as BaseUserConnection } from '@ai-assistant/types';

const TITLE = 'Connect Apps';

type UserConnection = BaseUserConnection & {
  runtimeHealthy?: boolean;
  aiReady?: boolean;
  healthError?: string | null;
};

const PROVIDERS = [
  {
    id: 'google',
    name: 'Google',
    description: 'Grant Gmail, Calendar & Drive access',
  },
  { id: 'whatsapp', name: 'WhatsApp', description: 'Linked device messages' },
] as const;

export default function IntegrationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<{
    providerId: string;
    action: 'connect' | 'disconnect';
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await apiClient.listConnections();
      setConnections(list);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      try {
        const parsed = new URL(url);
        const connected = parsed.searchParams.get('connected');
        const error = parsed.searchParams.get('error');
        if (connected === 'google') {
          void load();
          if (error) {
            const msg = decodeURIComponent(error);
            if (Platform.OS === 'web') {
              window.alert(`Google connect failed: ${msg}`);
            } else {
              Alert.alert('Google connect failed', msg);
            }
          }
        }
      } catch {
        if (url.includes('connected=google')) {
          void load();
        }
      }
    };

    void Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => sub.remove();
  }, [load]);

  const getConnection = (providerId: string) =>
    connections.find((c) => c.providerId === providerId);

  const isActive = (providerId: string) => getConnection(providerId)?.status === 'ACTIVE';

  const isPending = (providerId: string) => getConnection(providerId)?.status === 'PENDING';

  const isAiReady = (providerId: string) => {
    const connection = getConnection(providerId);
    if (!connection || connection.status !== 'ACTIVE') return false;
    return connection.aiReady !== false && connection.runtimeHealthy !== false;
  };

  const connectionSubtitle = (providerId: string, description: string) => {
    const connection = getConnection(providerId);
    if (!connection) return description;
    if (connection.status === 'PENDING') {
      return `${description} · Finish linking on the QR screen`;
    }
    if (connection.status !== 'ACTIVE') return description;
    if (!isAiReady(providerId)) {
      const detail = connection.healthError?.trim();
      if (detail) {
        return `${description} · ${detail}`;
      }
      return `${description} · Connected — offline (reconnect for AI access)`;
    }
    return `${description} · Available to AI`;
  };

  const handleConnect = async (providerId: string) => {
    setBusy({ providerId, action: 'connect' });
    try {
      const challenge = await apiClient.connectProvider(providerId);
      if (challenge.type === 'oauth' && challenge.url) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.href = challenge.url;
        } else {
          await Linking.openURL(challenge.url);
        }
      } else if (providerId === 'whatsapp' && challenge.connectionId) {
        if (challenge.state === 'ready') {
          await load();
          return;
        }
        router.push(
          integrationProviderRoute(providerId, {
            connectionId: challenge.connectionId,
          })
        );
      } else if (challenge.type === 'local') {
        await load();
      }
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not start connection';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Connect failed', message);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleOfflineAction = (providerId: string, name: string) => {
    const runReconnect = () => void handleConnect(providerId);
    const runDisconnect = () => confirmDisconnect(providerId, name);

    if (Platform.OS === 'web') {
      const reconnect = window.confirm(
        `${name} is connected but offline. Reconnect now? (Cancel to stay linked.)`
      );
      if (reconnect) runReconnect();
      return;
    }

    Alert.alert(`${name} offline`, 'Reconnect to restore AI access, or disconnect the app.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reconnect', onPress: runReconnect },
      { text: 'Disconnect', style: 'destructive', onPress: runDisconnect },
    ]);
  };

  const confirmDisconnect = (providerId: string, name: string) => {
    const connection = getConnection(providerId);
    if (!connection) return;

    const message = `Disconnect ${name}?`;
    const run = async () => {
      setBusy({ providerId, action: 'disconnect' });
      try {
        await apiClient.disconnectConnection(connection.id);
        await load();
      } catch (e) {
        const message =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Could not disconnect';
        if (Platform.OS === 'web') {
          window.alert(message);
        } else {
          Alert.alert('Disconnect failed', message);
        }
      } finally {
        setBusy(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(message)) void run();
      return;
    }

    Alert.alert('Disconnect', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => void run() },
    ]);
  };

  const openPendingWhatsApp = (connectionId: string) => {
    router.push(integrationProviderRoute('whatsapp', { connectionId }));
  };

  if (loading) {
    return (
      <Screen padded={false}>
        <AppHeader title={TITLE} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <AppHeader title={TITLE} />
      <FlatList
        data={PROVIDERS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="caption" muted style={styles.subtitle}>
              You are signed in to AI Assistant. Connecting an app grants API access
              only — it does not sign you out or log you in again.
            </Text>
            <Text variant="caption" muted style={styles.subtitle}>
              For Google, you will approve Gmail, Calendar, and Drive permissions in
              Google&apos;s consent screen. All three APIs must be enabled in your Google
              Cloud project.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const connected = isActive(item.id);
          const pending = isPending(item.id);
          const aiReady = isAiReady(item.id);
          const isBusy = busy?.providerId === item.id;
          const busyAction = isBusy ? busy?.action : null;
          const connection = getConnection(item.id);

          const actionLabel = pending
            ? 'Continue'
            : connected
              ? aiReady
                ? 'Disconnect'
                : 'Reconnect'
              : 'Connect';

          const loadingLabel =
            busyAction === 'disconnect' ? 'Disconnecting…' : 'Connecting…';

          return (
            <FadeIn delay={index * 40} style={styles.cardWrap}>
              <Card style={styles.card}>
                <ProviderIcon providerId={item.id} size="sm" />
                <View style={styles.cardBody}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="caption" muted numberOfLines={3}>
                    {connectionSubtitle(item.id, item.description)}
                  </Text>
                </View>
                <IntegrationActionButton
                  variant={connected && aiReady ? 'disconnect' : 'connect'}
                  label={actionLabel}
                  loadingLabel={loadingLabel}
                  loading={isBusy}
                  disabled={isBusy}
                  onPress={() => {
                    if (pending && item.id === 'whatsapp' && connection) {
                      openPendingWhatsApp(connection.id);
                      return;
                    }
                    if (!connected && !pending) void handleConnect(item.id);
                    else if (connected && aiReady) confirmDisconnect(item.id, item.name);
                    else if (connected) handleOfflineAction(item.id, item.name);
                  }}
                />
              </Card>
            </FadeIn>
          );
        }}
        ListFooterComponent={
          connections.length === 0 ? (
            <EmptyState
              icon={<DrawerColorIcon name="connectApps" iconSize={36} />}
              title="No apps linked yet"
              description="Tap Connect on any app above."
            />
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: spacing.md, paddingBottom: 140, flexGrow: 1 },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  subtitle: { lineHeight: 18 },
  cardWrap: { marginBottom: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  cardBody: { flex: 1, gap: 2, minWidth: 0 },
});
