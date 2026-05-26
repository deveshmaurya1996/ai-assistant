import { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppHeader } from '@/components/layout/AppHeader';
import { DrawerColorIcon } from '@/components/layout/DrawerColorIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { apiClient } from '@/lib/api-client';
import type { UserNote } from '@ai-assistant/types';
import { useSavedNotesStore } from '@/features/notes/savedNotesStore';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotesScreen() {
  const { colors } = useTheme();
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const removeSavedMessageId = useSavedNotesStore((s) => s.removeSavedMessageId);

  const load = useCallback(async () => {
    try {
      const list = await apiClient.listNotes();
      setNotes(list);
    } catch {
      setNotes([]);
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

  const onDelete = (note: UserNote) => {
    Alert.alert('Delete note?', note.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await apiClient.deleteNote(note.id);
              if (note.sourceMessageId) {
                removeSavedMessageId(note.sourceMessageId);
              }
              setNotes((prev) => prev.filter((n) => n.id !== note.id));
            } catch (e) {
              Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
            }
          })();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen padded={false}>
        <AppHeader title="Notes" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <AppHeader title="Notes" />
      <Text variant="body" muted style={styles.subtitle}>
        Saved from chat, voice, or the save button on assistant replies. Titles are generated
        automatically.
      </Text>
      <FlatList
        data={notes}
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
        ListEmptyComponent={
          <EmptyState
            icon={<DrawerColorIcon name="notes" iconSize={40} />}
            title="No notes yet"
            description='Ask the assistant to "save a note", or tap Save on any reply in chat.'
          />
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text variant="bodyMedium" numberOfLines={2} style={styles.title}>
                {item.title}
              </Text>
              <Pressable
                onPress={() => onDelete(item)}
                hitSlop={12}
                accessibilityLabel="Delete note">
                <Trash2 color={colors.textMuted} size={18} />
              </Pressable>
            </View>
            <Text variant="body" numberOfLines={6} style={styles.preview}>
              {item.content}
            </Text>
            <Text variant="caption" muted>
              {formatWhen(item.updatedAt)}
            </Text>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  subtitle: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  list: { padding: spacing.md, paddingBottom: 120, flexGrow: 1 },
  card: { marginBottom: spacing.sm, gap: spacing.xs },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { flex: 1 },
  preview: { lineHeight: 22 },
});
