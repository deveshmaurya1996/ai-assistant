import { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Bell, ChevronRight, Pencil, Trash2, Zap } from 'lucide-react-native';
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
import { Routes } from '@/lib/routes';
import { AutomationEditModal } from '@/features/automations/AutomationEditModal';
import {
  automationKindLabel,
  type AgentDigestRunResult,
  type Automation,
} from '@ai-assistant/types';

function lastRunSummary(item: Automation): string | null {
  const run = item.runs?.[0];
  if (!run?.result || typeof run.result !== 'object') return null;
  const summary = (run.result as unknown as AgentDigestRunResult).summary;
  if (!summary || typeof summary !== 'string') return null;
  return summary.length > 100 ? `${summary.slice(0, 97)}…` : summary;
}

function formatAutomationSchedule(item: Automation): string {
  const status = item.isActive ? 'Running' : 'Paused';
  const label = item.scheduleLabel ?? item.schedule;
  return label ? `${status}: ${label}` : status;
}

export default function AutomationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Automation | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await apiClient.listAutomations();
      setAutomations(list);
    } catch {
      setAutomations([]);
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

  const handleDelete = useCallback(
    (item: Automation) => {
      const message = `Remove "${item.name}"?`;

      const runDelete = async () => {
        setDeletingId(item.id);
        try {
          await apiClient.deleteAutomation(item.id);
          await load();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not delete automation';
          if (Platform.OS === 'web') {
            window.alert(msg);
          } else {
            Alert.alert('Delete failed', msg);
          }
        } finally {
          setDeletingId(null);
        }
      };

      if (Platform.OS === 'web') {
        if (window.confirm(message)) void runDelete();
        return;
      }

      Alert.alert('Delete automation', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void runDelete() },
      ]);
    },
    [load]
  );

  if (loading) {
    return (
      <Screen padded={false}>
        <AppHeader title="Automations" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <AppHeader title="Automations" />
      <FlatList
        data={automations}
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
          <>
            <Text variant="body" muted style={styles.subtitle}>
              Scheduled tasks your assistant runs for you. Tap to edit or use the trash icon to remove.
            </Text>
            <FadeIn>
              <PressableScale onPress={() => router.push(Routes.automationsReminders)}>
                <Card style={styles.quickLink}>
                  <View style={[styles.quickIcon, { backgroundColor: colors.primaryMuted }]}>
                    <Bell color={colors.primary} size={22} />
                  </View>
                  <View style={styles.quickText}>
                    <Text variant="bodyMedium">Reminders</Text>
                    <Text variant="caption" muted>
                      View upcoming scheduled reminders
                    </Text>
                  </View>
                  <ChevronRight color={colors.textMuted} size={20} />
                </Card>
              </PressableScale>
            </FadeIn>
            <Text variant="label" muted style={styles.sectionLabel}>
              Your automations
            </Text>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Zap color={colors.textMuted} size={40} />}
            title="No automations yet"
            description="Ask your assistant to set up recurring tasks, or create them from the web dashboard."
          />
        }
        renderItem={({ item, index }) => {
          const kind = automationKindLabel(item.action);
          const summary = lastRunSummary(item);

          return (
            <FadeIn delay={index * 40} style={styles.rowWrap}>
              <Card style={styles.card}>
                <PressableScale
                  onPress={() => setEditing(item)}
                  style={styles.cardMain}
                  disabled={deletingId === item.id}>
                  <View
                    style={[
                      styles.statusIcon,
                      {
                        backgroundColor: item.isActive
                          ? `${colors.success}22`
                          : colors.surfaceElevated,
                      },
                    ]}>
                    <Zap
                      color={item.isActive ? colors.success : colors.textMuted}
                      size={20}
                    />
                  </View>
                  <View style={styles.automationBody}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {kind ? `${kind}: ${item.name}` : item.name}
                    </Text>
                    <Text variant="caption" muted>
                      {formatAutomationSchedule(item)}
                    </Text>
                    {summary ? (
                      <Text variant="caption" muted numberOfLines={2} style={styles.summary}>
                        {summary}
                      </Text>
                    ) : null}
                  </View>
                </PressableScale>
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
                      {deletingId === item.id ? (
                        <ActivityIndicator size="small" color={colors.danger} />
                      ) : (
                        <Trash2 color={colors.danger} size={18} />
                      )}
                    </View>
                  </PressableScale>
                </View>
              </Card>
            </FadeIn>
          );
        }}
      />

      <AutomationEditModal
        automation={editing}
        visible={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: spacing.md, paddingBottom: 140, flexGrow: 1 },
  subtitle: { marginBottom: spacing.md },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: { flex: 1, gap: 2 },
  sectionLabel: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  rowWrap: { marginBottom: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  automationBody: { flex: 1, gap: 4 },
  summary: { marginTop: 2 },
  actions: { gap: spacing.xs },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
