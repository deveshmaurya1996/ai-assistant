import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { TabView } from 'react-native-tab-view';
import { Bell, Pencil, Trash2, Zap } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppHeader } from '@/components/layout/AppHeader';
import { FadeIn } from '@/components/motion/FadeIn';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { apiClient } from '@/lib/api-client';
import { API_URL } from '@/lib/config';
import { formatApiError } from '@/lib/format-ai-error';
import { AutomationEditModal } from '@/features/automations/AutomationEditModal';
import { ReminderEditModal } from '@/features/reminders/ReminderEditModal';
import { subscribeReminderRefresh } from '@/features/reminders/reminderEvents';
import {
  automationKindLabel,
  type AgentDigestRunResult,
  type Automation,
  type Reminder,
} from '@ai-assistant/types';
import { formatReminderTime } from '@/lib/formatReminderTime';

type ReminderRow = Reminder & { scheduleLabel?: string | null };

const TAB_OPTIONS = [
  { value: 'tasks' as const, label: 'Scheduled Task' },
  { value: 'reminders' as const, label: 'Reminder' },
];

const TAB_ROUTES = TAB_OPTIONS.map((option) => ({
  key: option.value,
  title: option.label,
}));

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

function getReminderTitle(item: ReminderRow): string {
  return (item.payload as { title?: string }).title ?? 'Reminder';
}

function formatReminderStatus(status: ReminderRow['status']): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'PAUSED':
      return 'Paused';
    case 'FIRED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'FAILED':
      return 'Failed';
    default:
      return String(status).toLowerCase();
  }
}

export default function SchedulerScreen() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const { width } = useWindowDimensions();
  const { colors, screenStyle } = useTheme();
  const [tabIndex, setTabIndex] = useState(tabParam === 'reminders' ? 1 : 0);

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksRefreshing, setTasksRefreshing] = useState(false);
  const [deletingAutomationId, setDeletingAutomationId] = useState<string | null>(null);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);

  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(true);
  const [remindersRefreshing, setRemindersRefreshing] = useState(false);
  const [remindersLoadError, setRemindersLoadError] = useState<string | null>(null);
  const [deletingReminderId, setDeletingReminderId] = useState<string | null>(null);
  const [editingReminder, setEditingReminder] = useState<ReminderRow | null>(null);

  useEffect(() => {
    if (tabParam === 'reminders') setTabIndex(1);
    else if (tabParam === 'tasks') setTabIndex(0);
  }, [tabParam]);

  const tab = TAB_OPTIONS[tabIndex]?.value ?? 'tasks';

  const loadAutomations = useCallback(async () => {
    try {
      const list = await apiClient.listAutomations();
      setAutomations(list);
    } catch {
      setAutomations([]);
    } finally {
      setTasksLoading(false);
      setTasksRefreshing(false);
    }
  }, []);

  const loadReminders = useCallback(async () => {
    try {
      const list = await apiClient.listReminders();
      setReminders(list as ReminderRow[]);
      setRemindersLoadError(null);
    } catch (err) {
      setReminders([]);
      setRemindersLoadError(
        `${formatApiError(err)}\n\nAPI: ${API_URL}`
      );
    } finally {
      setRemindersLoading(false);
      setRemindersRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAutomations();
      void loadReminders();
    }, [loadAutomations, loadReminders])
  );

  useEffect(() => subscribeReminderRefresh(() => void loadReminders()), [loadReminders]);

  const handleDeleteAutomation = useCallback(
    (item: Automation) => {
      const message = `Remove "${item.name}"?`;

      const runDelete = async () => {
        setDeletingAutomationId(item.id);
        try {
          await apiClient.deleteAutomation(item.id);
          await loadAutomations();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not delete automation';
          if (Platform.OS === 'web') {
            window.alert(msg);
          } else {
            Alert.alert('Delete failed', msg);
          }
        } finally {
          setDeletingAutomationId(null);
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
    [loadAutomations]
  );

  const handleDeleteReminder = useCallback(
    (item: ReminderRow) => {
      const title = getReminderTitle(item);
      const message = `Remove "${title}"?`;

      const runDelete = async () => {
        setDeletingReminderId(item.id);
        try {
          await apiClient.deleteReminder(item.id);
          await loadReminders();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not delete reminder';
          if (Platform.OS === 'web') {
            window.alert(msg);
          } else {
            Alert.alert('Delete failed', msg);
          }
        } finally {
          setDeletingReminderId(null);
        }
      };

      if (Platform.OS === 'web') {
        if (window.confirm(message)) void runDelete();
        return;
      }

      Alert.alert('Delete reminder', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void runDelete() },
      ]);
    },
    [loadReminders]
  );

  const renderScene = useCallback(
    ({ route }: { route: { key: string } }) => {
      if (route.key === 'tasks') {
        if (tasksLoading) {
          return (
            <View style={styles.scene}>
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            </View>
          );
        }

        return (
          <View style={styles.scene}>
            <FlatList
            data={automations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={tasksRefreshing}
                onRefresh={() => {
                  setTasksRefreshing(true);
                  void loadAutomations();
                }}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon={<Zap color={colors.textMuted} size={40} />}
                title="No scheduled tasks yet"
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
                      onPress={() => setEditingAutomation(item)}
                      style={styles.cardMain}
                      disabled={deletingAutomationId === item.id}>
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
                      <PressableScale onPress={() => setEditingAutomation(item)} hitSlop={8}>
                        <View style={[styles.actionBtn, { backgroundColor: colors.surfaceElevated }]}>
                          <Pencil color={colors.textMuted} size={18} />
                        </View>
                      </PressableScale>
                      <PressableScale
                        onPress={() => handleDeleteAutomation(item)}
                        disabled={deletingAutomationId === item.id}
                        hitSlop={8}>
                        <View style={[styles.actionBtn, { backgroundColor: colors.surfaceElevated }]}>
                          {deletingAutomationId === item.id ? (
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
          </View>
        );
      }

      if (remindersLoading) {
        return (
          <View style={styles.scene}>
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          </View>
        );
      }

      return (
        <View style={styles.scene}>
          <FlatList
          data={reminders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={remindersRefreshing}
              onRefresh={() => {
                setRemindersRefreshing(true);
                void loadReminders();
              }}
            />
          }
          ListEmptyComponent={
            remindersLoadError ? (
              <EmptyState
                icon={<Bell color={colors.textMuted} size={40} />}
                title="Could not load reminders"
                description={remindersLoadError}
              />
            ) : (
              <EmptyState
                icon={<Bell color={colors.textMuted} size={40} />}
                title="No reminders scheduled"
                description="Ask your assistant to remind you about something, and it will show up here."
              />
            )
          }
          renderItem={({ item, index }) => {
            const title = getReminderTitle(item);
            const fireAt = new Date(item.nextFireAt);
            const statusLabel = formatReminderStatus(item.status);

            const showUserPrompt =
              item.userPrompt &&
              item.userPrompt.trim().toLowerCase() !== title.trim().toLowerCase();

            return (
              <FadeIn delay={index * 40} style={styles.rowWrap}>
                <Card style={styles.card}>
                  <PressableScale
                    onPress={() => setEditingReminder(item)}
                    style={styles.cardMain}
                    disabled={deletingReminderId === item.id}>
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
                        {statusLabel}
                      </Text>
                    </View>
                  </PressableScale>
                  <View style={styles.actions}>
                    <PressableScale onPress={() => setEditingReminder(item)} hitSlop={8}>
                      <View style={[styles.actionBtn, { backgroundColor: colors.surfaceElevated }]}>
                        <Pencil color={colors.textMuted} size={18} />
                      </View>
                    </PressableScale>
                    <PressableScale
                      onPress={() => handleDeleteReminder(item)}
                      disabled={deletingReminderId === item.id}
                      hitSlop={8}>
                      <View style={[styles.actionBtn, { backgroundColor: colors.surfaceElevated }]}>
                        {deletingReminderId === item.id ? (
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
        </View>
      );
    },
    [
      automations,
      colors.danger,
      colors.primary,
      colors.primaryMuted,
      colors.success,
      colors.surfaceElevated,
      colors.textMuted,
      deletingAutomationId,
      deletingReminderId,
      handleDeleteAutomation,
      handleDeleteReminder,
      loadAutomations,
      loadReminders,
      reminders,
      remindersLoadError,
      remindersLoading,
      remindersRefreshing,
      tasksLoading,
      tasksRefreshing,
    ]
  );

  const navigationState = useMemo(
    () => ({ index: tabIndex, routes: TAB_ROUTES }),
    [tabIndex]
  );

  return (
    <View style={screenStyle}>
      <AppHeader title="Scheduler" />
      <View style={styles.tabs}>
        <SegmentedControl
          options={TAB_OPTIONS}
          value={tab}
          onChange={(value) => {
            const nextIndex = TAB_OPTIONS.findIndex((option) => option.value === value);
            if (nextIndex >= 0) setTabIndex(nextIndex);
          }}
        />
      </View>

      <TabView
        navigationState={navigationState}
        renderScene={renderScene}
        onIndexChange={setTabIndex}
        renderTabBar={() => null}
        swipeEnabled
        initialLayout={{ width }}
        style={styles.tabView}
      />

      <AutomationEditModal
        automation={editingAutomation}
        visible={editingAutomation !== null}
        onClose={() => setEditingAutomation(null)}
        onSaved={() => void loadAutomations()}
      />
      <ReminderEditModal
        reminder={editingReminder}
        visible={editingReminder !== null}
        onClose={() => setEditingReminder(null)}
        onSaved={() => void loadReminders()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabView: { flex: 1 },
  scene: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  list: { padding: spacing.md, paddingBottom: 140, flexGrow: 1 },
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
