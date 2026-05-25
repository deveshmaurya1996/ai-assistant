import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MessageSquare, Mic, Trash2 } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { AppHeader } from '@/components/layout/AppHeader';
import { FadeIn } from '@/components/motion/FadeIn';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import type { ChatSession } from '@ai-assistant/sdk';
import { apiClient } from '@/lib/api-client';

export default function ChatsScreen() {
  const { colors } = useTheme();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await apiClient.listSessions();
      setSessions(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not load chats';
      Alert.alert('Error', message);
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
    router.push({
      pathname: '/(app)/chat/[id]',
      params: { id: session.id, title: session.title ?? 'New Chat' },
    });
  };

  const openChat = (item: ChatSession) => {
    const isVoice = item.kind === 'voice';
    router.push({
      pathname: '/(app)/chat/[id]',
      params: {
        id: item.id,
        title: item.title ?? (isVoice ? 'Voice chat' : 'New Chat'),
        kind: item.kind,
      },
    });
  };

  const runDelete = useCallback(async (item: ChatSession) => {
    try {
      await apiClient.deleteSession(item.id);
      setSessions((prev) => prev.filter((s) => s.id !== item.id));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not delete chat';
      if (Platform.OS === 'web') {
        window.alert(`Delete failed: ${message}`);
      } else {
        Alert.alert('Delete failed', message);
      }
    }
  }, []);

  const confirmDelete = useCallback(
    (item: ChatSession) => {
      const message = `Remove "${item.title ?? 'Untitled'}"? This cannot be undone.`;
      if (Platform.OS === 'web') {
        if (window.confirm(message)) {
          void runDelete(item);
        }
        return;
      }
      Alert.alert('Delete chat', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void runDelete(item);
          },
        },
      ]);
    },
    [runDelete]
  );

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
          <FadeIn delay={index * 40} style={styles.rowWrap}>
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Pressable
                style={styles.rowMain}
                onPress={() => openChat(item)}
                onLongPress={() => confirmDelete(item)}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        item.kind === 'voice' ? colors.primaryMuted : colors.primaryMuted,
                      borderWidth: item.kind === 'voice' ? 1 : 0,
                      borderColor: item.kind === 'voice' ? colors.primary : 'transparent',
                    },
                  ]}>
                  {item.kind === 'voice' ? (
                    <Mic color={colors.primary} size={18} />
                  ) : (
                    <MessageSquare color={colors.primary} size={18} />
                  )}
                </View>
                <View style={styles.rowText}>
                  <Text variant="bodyMedium" style={styles.rowTitle} numberOfLines={1}>
                    {item.title ?? (item.kind === 'voice' ? 'Voice chat' : 'Untitled')}
                  </Text>
                  {item.kind === 'voice' ? (
                    <Text variant="caption" muted>
                      Spoken conversation
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              <PressableScale
                onPress={() => confirmDelete(item)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.deleteBtn}
                accessibilityLabel={`Delete ${item.title ?? 'chat'}`}
                accessibilityRole="button">
                <Trash2 color={colors.textMuted} size={20} />
              </PressableScale>
            </View>
          </FadeIn>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 140, flexGrow: 1 },
  rowWrap: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    flex: 0,
  },
  dot: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
});
