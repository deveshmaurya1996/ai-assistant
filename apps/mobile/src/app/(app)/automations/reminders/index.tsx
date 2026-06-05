import { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Bell, Pencil, Trash2 } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppHeader } from '@/components/layout/AppHeader';
import { FadeIn } from '@/components/motion/FadeIn';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { apiClient } from '@/lib/api-client';
import { ReminderEditModal } from '@/features/reminders/ReminderEditModal';
import { subscribeReminderRefresh } from '@/features/reminders/reminderEvents';
import type { Reminder } from '@ai-assistant/types';

type ReminderRow = Reminder & { scheduleLabel?: string | null };

export default function RemindersScreen() {
  const { colors } = useTheme();
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReminderRow | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await apiClient.listReminders();
      setReminders(list as ReminderRow[]);
    } catch {
      setReminders([]);
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

  useEffect(() => subscribeReminderRefresh(() => void load()), [load]);

  const handleDelete = useCallback(
    (item: ReminderRow) => {
      Alert.alert('Delete reminder', `Remove "${getTitle(item)}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeletingId(item.id);
            void apiClient
              .deleteReminder(item.id)
              .then(() => load())
              .finally(() => setDeletingId(null));
          },
        },
      ]);
    },
    [load]
  );

  if (loading) {
    return (
      <Screen padded={false}>
        <AppHeader title="Reminders" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <AppHeader title="Reminders" />
      <FlatList
        data={reminders}
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
          <Text variant="body" muted style={styles.subtitle}>
            Tap a reminder to view and edit it.
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Bell color={colors.textMuted} size={40} />}
            title="No reminders scheduled"
            description="Ask your assistant to remind you about something, and it will show up here."
          />
        }
        renderItem={({ item, index }) => {
          const title = getTitle(item);
          const fireAt = new Date(item.nextFireAt);
          const isPaused = item.status === 'PAUSED';

          const showUserPrompt =
            item.userPrompt && item.userPrompt.trim().toLowerCase() !== title.trim().toLowerCase();

          return (
            <FadeIn delay={index * 40} style={styles.rowWrap}>
              <PressableScale onPress={() => setEditing(item)}>
                <Card style={styles.card}>
                  <View style={[styles.icon, { backgroundColor: colors.primaryMuted }]}>
                    <Bell color={colors.primary} size={20} />
                  </View>
                  <View style={styles.body}>
                    <Text variant="bodyMedium" numberOfLines={2}>
                      {title}
                    </Text>
                    <Text variant="caption" muted>
                      {item.scheduleLabel ?? formatReminderTime(fireAt)}
                    </Text>
                    {showUserPrompt ? (
                      <Text variant="caption" muted numberOfLines={2} style={styles.userPrompt}>
                        {item.userPrompt}
                      </Text>
                    ) : null}
                    <Text variant="label" muted style={styles.status}>
                      {isPaused ? 'Paused' : item.status.toLowerCase()}
                    </Text>
                  </View>
                  <View style={styles.actions}>
                    <PressableScale onPress={() => setEditing(item)} hitSlop={8}>
                      <View style={[styles.actionBtn, { backgroundColor: colors.surfaceElevated }]}>
                        <Pencil color={colors.textMuted} size={18} />
                      </View>
                    </PressableScale>
                    <PressableScale
                      onPress={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      hitSlop={8}>
                      <View style={[styles.actionBtn, { backgroundColor: colors.surfaceElevated }]}>
                        <Trash2 color={colors.danger} size={18} />
                      </View>
                    </PressableScale>
                  </View>
                </Card>
              </PressableScale>
            </FadeIn>
          );
        }}
      />

      <ReminderEditModal
        reminder={editing}
        visible={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
    </Screen>
  );
}

function getTitle(item: ReminderRow): string {
  return (item.payload as { title?: string }).title ?? 'Reminder';
}

function formatReminderTime(date: Date): string {
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (isToday) return `Today at ${time}`;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: spacing.md, paddingBottom: 140, flexGrow: 1 },
  subtitle: { marginBottom: spacing.md },
  rowWrap: { marginBottom: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 4 },
  status: { textTransform: 'capitalize', marginTop: 2 },
  userPrompt: { fontStyle: 'italic', marginTop: 2 },
  actions: { gap: spacing.xs },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
