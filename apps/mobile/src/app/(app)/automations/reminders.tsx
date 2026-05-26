import { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppHeader } from '@/components/layout/AppHeader';
import { FadeIn } from '@/components/motion/FadeIn';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { apiClient } from '@/lib/api-client';
import type { Reminder } from '@ai-assistant/types';

export default function RemindersScreen() {
  const { colors } = useTheme();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await apiClient.listReminders();
      setReminders(list);
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
            Upcoming reminders your assistant will fire at the scheduled time.
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
          const title = (item.payload as { title?: string }).title ?? 'Reminder';
          const fireAt = new Date(item.fireAt);

          return (
            <FadeIn delay={index * 40} style={styles.rowWrap}>
              <Card style={styles.card}>
                <View style={[styles.icon, { backgroundColor: colors.primaryMuted }]}>
                  <Bell color={colors.primary} size={20} />
                </View>
                <View style={styles.body}>
                  <Text variant="bodyMedium" numberOfLines={2}>
                    {title}
                  </Text>
                  <Text variant="caption" muted>
                    {formatReminderTime(fireAt)}
                  </Text>
                  <Text variant="label" muted style={styles.status}>
                    {item.status.toLowerCase()}
                  </Text>
                </View>
              </Card>
            </FadeIn>
          );
        }}
      />
    </Screen>
  );
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
});
