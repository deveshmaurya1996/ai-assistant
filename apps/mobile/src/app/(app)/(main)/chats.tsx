import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MessageSquare } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { AppHeader } from '@/components/layout/AppHeader';
import { FadeIn } from '@/components/motion/FadeIn';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { apiClient, type ChatSession } from '@/lib/api';

export default function ChatsScreen() {
  const { colors } = useTheme();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await apiClient.listSessions();
      setSessions(data);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const createChat = async () => {
    const session = await apiClient.createSession('New Chat');
    router.push(`/(app)/chat/${session.id}`);
  };

  return (
    <Screen padded={false}>
      <AppHeader title="Chats" onNewChat={createChat} />
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={
          <FadeIn>
            <View style={styles.empty}>
              <MessageSquare color={colors.textMuted} size={48} />
              <Text variant="body" muted style={{ marginTop: spacing.md }}>
                No chats yet — start one
              </Text>
            </View>
          </FadeIn>
        }
        renderItem={({ item, index }) => (
          <FadeIn delay={index * 40}>
            <Pressable
              onPress={() => router.push(`/(app)/chat/${item.id}`)}
              style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={[styles.dot, { backgroundColor: colors.primaryMuted }]}>
                <MessageSquare color={colors.primary} size={18} />
              </View>
              <Text variant="bodyMedium" style={{ flex: 1 }}>
                {item.title ?? 'Untitled'}
              </Text>
            </Pressable>
          </FadeIn>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 140, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
});
