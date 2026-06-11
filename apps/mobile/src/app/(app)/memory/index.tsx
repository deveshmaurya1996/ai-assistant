import { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Brain } from 'lucide-react-native';
import type { MemoryItem, MemoryType } from '@ai-assistant/types';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { apiClient } from '@/lib/api-client';
import { API_URL } from '@/lib/config';
import { formatApiError } from '@/lib/format-ai-error';

function formatMemoryType(type: MemoryType): string {
  if (type === 'PREFERENCE') return 'Preference';
  if (type === 'FACT') return 'Fact';
  return type.charAt(0) + type.slice(1).toLowerCase();
}

function formatMemorySource(item: MemoryItem): string | null {
  const source = item.metadata?.source;
  if (source === 'explicit_remember') return 'You saved';
  if (source === 'extraction') return 'Learned from chat';
  return null;
}

export default function MemoryScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (options?: { quiet?: boolean }) => {
    setLoadError(null);
    try {
      const data = await apiClient.listMemoryItems();
      setItems(data);
    } catch (err) {
      const message = formatApiError(err);
      setLoadError(message);
      setItems([]);
      if (!options?.quiet) {
        Alert.alert('Could not load memories', message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const onDelete = (item: MemoryItem) => {
    Alert.alert('Delete memory?', item.content.slice(0, 120), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await apiClient.deleteMemoryItem(item.id);
              setItems((prev) => prev.filter((m) => m.id !== item.id));
            } catch (err) {
              Alert.alert('Delete failed', formatApiError(err));
            }
          })();
        },
      },
    ]);
  };

  return (
    <Screen padded={false}>
      <AppHeader title="Saved memories" />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ quiet: true });
            }}
          />
        }
        ListHeaderComponent={
          <Text variant="caption" muted style={styles.hint}>
            Short facts and preferences your assistant uses across chats. Say “Remember: …” to
            add one. Full conversations stay in Chats.
          </Text>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon={<Brain color={colors.textMuted} size={40} />}
              title={loadError ? 'Could not load memories' : 'No saved memories yet'}
              description={
                loadError
                  ? `${loadError}\n\nAPI: ${API_URL}\nStart the stack (pnpm dev), sign in, then pull to refresh.`
                  : 'Memories appear when you say “Remember: …” or when the assistant learns something durable from chat. Pull to refresh after messaging.'
              }
              action={
                loadError ? (
                  <PressableScale onPress={() => void load()}>
                    <Text variant="bodyMedium" style={{ color: colors.primary }}>
                      Retry
                    </Text>
                  </PressableScale>
                ) : undefined
              }
            />
          ) : null
        }
        renderItem={({ item }) => {
          const sourceLabel = formatMemorySource(item);
          return (
            <Card style={styles.card}>
              <View style={styles.metaRow}>
                <Text variant="caption" muted>
                  {formatMemoryType(item.type)}
                </Text>
                {sourceLabel ? (
                  <Text variant="caption" muted>
                    {sourceLabel}
                  </Text>
                ) : null}
              </View>
              <Text variant="body" style={styles.content}>
                {item.content.trim()}
              </Text>
              <PressableScale onPress={() => onDelete(item)}>
                <Text variant="caption" style={{ color: colors.danger, marginTop: spacing.sm }}>
                  Delete
                </Text>
              </PressableScale>
            </Card>
          );
        }}
      />
      {loading && items.length === 0 ? (
        <View style={styles.loading}>
          <Text variant="body" muted>
            Loading…
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
    gap: spacing.sm,
  },
  hint: {
    marginBottom: spacing.md,
  },
  card: {
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  content: {
    marginTop: spacing.xs,
  },
  loading: {
    padding: spacing.lg,
    alignItems: 'center',
  },
});
