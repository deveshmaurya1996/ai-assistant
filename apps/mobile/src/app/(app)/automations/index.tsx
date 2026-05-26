import { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Bell, ChevronRight, Pause, Zap } from 'lucide-react-native';
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
import type { Automation } from '@ai-assistant/types';

export default function AutomationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
              Scheduled tasks and reminders your assistant runs for you.
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
        renderItem={({ item, index }) => (
          <FadeIn delay={index * 40} style={styles.rowWrap}>
            <Card style={styles.automationCard}>
              <View
                style={[
                  styles.statusIcon,
                  {
                    backgroundColor: item.isActive
                      ? `${colors.success}22`
                      : colors.surfaceElevated,
                  },
                ]}>
                {item.isActive ? (
                  <Zap color={colors.success} size={20} />
                ) : (
                  <Pause color={colors.textMuted} size={20} />
                )}
              </View>
              <View style={styles.automationBody}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="caption" muted>
                  {item.isActive ? 'Running' : 'Paused'}
                  {item.schedule ? ` · ${item.schedule}` : ''}
                </Text>
              </View>
              <View
                style={[
                  styles.pill,
                  {
                    backgroundColor: item.isActive
                      ? `${colors.success}22`
                      : colors.surfaceElevated,
                  },
                ]}>
                <Text
                  variant="label"
                  style={{ color: item.isActive ? colors.success : colors.textMuted }}>
                  {item.isActive ? 'Active' : 'Paused'}
                </Text>
              </View>
            </Card>
          </FadeIn>
        )}
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
  automationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  automationBody: { flex: 1, gap: 2 },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
});
