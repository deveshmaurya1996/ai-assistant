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
  Pressable,
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
};

const PROVIDERS = [
  {
    id: 'google',
    name: 'Google',
    description: 'Grant Gmail, Calendar & Drive access',
  },
  { id: 'whatsapp', name: 'WhatsApp', description: 'Linked device messages' },
  {
    id: 'files',
    name: 'Phone files',
    description: 'Sync documents & photos from your phone for AI search',
  },
] as const;

export default function IntegrationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const isAiReady = (providerId: string) => {
    const connection = getConnection(providerId);
    if (!connection || connection.status !== 'ACTIVE') return false;
    return connection.aiReady !== false && connection.runtimeHealthy !== false;
  };

  const connectionSubtitle = (providerId: string, description: string) => {
    const connection = getConnection(providerId);
    if (!connection || connection.status !== 'ACTIVE') return description;
    if (!isAiReady(providerId)) {
      return `${description} · Connected — offline (reconnect for AI access)`;
    }
    return `${description} · Available to AI`;
  };

  const handleConnect = async (providerId: string) => {
    setBusyId(providerId);
    try {
      const challenge = await apiClient.connectProvider(providerId);
      if (challenge.type === 'oauth' && challenge.url) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.href = challenge.url;
        } else {
          await Linking.openURL(challenge.url);
        }
      } else if (providerId === 'whatsapp' && challenge.connectionId) {
        router.push(
          integrationProviderRoute(providerId, {
            connectionId: challenge.connectionId,
          })
        );
      } else if (providerId === 'files' && challenge.connectionId) {
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
      setBusyId(null);
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
      setBusyId(providerId);
      try {
        await apiClient.disconnectConnection(connection.id);
        await load();
      } finally {
        setBusyId(null);
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
              Google&apos;s consent screen.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const connected = isActive(item.id);
          const aiReady = isAiReady(item.id);
          const busy = busyId === item.id;

          return (
            <FadeIn delay={index * 40} style={styles.cardWrap}>
              <Pressable
                disabled={item.id !== 'files' || !getConnection(item.id)}
                onPress={() => {
                  const c = getConnection(item.id);
                  if (item.id === 'files' && c) {
                    router.push(
                      integrationProviderRoute(item.id, { connectionId: c.id })
                    );
                  }
                }}
              >
              <Card style={styles.card}>
                <ProviderIcon providerId={item.id} size="sm" />
                <View style={styles.cardBody}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="caption" muted numberOfLines={2}>
                    {connected
                      ? connectionSubtitle(item.id, item.description)
                      : item.description}
                  </Text>
                </View>
                <IntegrationActionButton
                  variant={connected ? 'disconnect' : 'connect'}
                  label={
                    busy
                      ? '…'
                      : connected
                        ? aiReady
                          ? 'Disconnect'
                          : 'Reconnect'
                        : 'Connect'
                  }
                  loading={busy}
                  disabled={busy}
                  onPress={() => {
                    if (!connected) void handleConnect(item.id);
                    else if (aiReady) confirmDisconnect(item.id, item.name);
                    else handleOfflineAction(item.id, item.name);
                  }}
                />
              </Card>
              </Pressable>
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
