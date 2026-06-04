import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { LogOut, Pencil, Settings } from 'lucide-react-native';
import type { ChatSession } from '@ai-assistant/sdk';
import { Text } from '@/components/ui/Text';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { DrawerColorIcon } from '@/components/layout/DrawerColorIcon';
import { AssistantIcon } from '@/components/assistant/AssistantIcon';
import { ChatSessionActionsModal, type MenuAnchorRect } from '@/components/chat/ChatSessionActionsModal';
import { PulseDot } from '@/components/motion/PulseDot';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/stores/auth';
import { spacing, radii } from '@/theme/tokens';
import { Routes, assistantRoute, chatSessionRoute } from '@/lib/routes';
import { useChatSessions } from '@/features/chat/useChatSessions';
import { useChatSidebarSync } from '@/features/chat/chatSidebarSync';
import { resolveActiveChatSessionId } from '@/features/chat/chatRoutes';
import { prepareNewCompose, useComposeDraftStore } from '@/features/chat/chatSessionLifecycle';
import { useChatStreamStore } from '@/features/chat/chatStreamStore';
import { useSettingsStore } from '@/stores/settings';
import { MessageSquare, Mic, MoreVertical } from 'lucide-react-native';
import { getVersionDisplayLines } from '@/lib/version-display';

type DrawerContentProps = {
  navigation: { closeDrawer: () => void };
};

const COLLAPSED_CHAT_COUNT = 5;

function getCollapsedSessions(
  sessions: ChatSession[],
  activeSessionId?: string,
  limit = COLLAPSED_CHAT_COUNT
): ChatSession[] {
  if (sessions.length <= limit) return sessions;

  const head = sessions.slice(0, limit);
  if (!activeSessionId || head.some((s) => s.id === activeSessionId)) {
    return head;
  }

  const active = sessions.find((s) => s.id === activeSessionId);
  if (!active) return head;

  return [...sessions.slice(0, limit - 1), active];
}

function DrawerSessionRow({
  item,
  isActive,
  onOpen,
  onMenuPress,
}: {
  item: ChatSession;
  isActive: boolean;
  onOpen: (item: ChatSession) => void;
  onMenuPress: (item: ChatSession, anchor: MenuAnchorRect) => void;
}) {
  const { colors } = useTheme();
  const menuRef = useRef<View>(null);
  const isGenerating = useChatStreamStore((s) =>
    Boolean(s.sessions[item.id]?.isGenerating)
  );
  const isVoice = item.kind === 'voice';

  const handleMenuPress = () => {
    menuRef.current?.measureInWindow((x, y, width, height) => {
      onMenuPress(item, { x, y, width, height });
    });
  };

  return (
    <View
      style={[
        styles.row,
        isActive && {
          backgroundColor: colors.primaryMuted,
          borderRadius: radii.lg,
        },
      ]}>
      <Pressable style={styles.rowMain} onPress={() => onOpen(item)}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: isVoice ? colors.primary : colors.border,
              borderWidth: isVoice ? 1 : StyleSheet.hairlineWidth,
            },
          ]}>
          {isVoice ? (
            <Mic color={colors.primary} size={16} />
          ) : (
            <MessageSquare color={colors.primary} size={16} />
          )}
        </View>
        <View style={styles.rowText}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {item.title ?? (isVoice ? 'Voice chat' : 'Untitled')}
          </Text>
          {isGenerating ? (
            <View style={styles.generatingRow}>
              <PulseDot color={colors.primary} />
            </View>
          ) : isVoice ? (
            <Text variant="caption" muted>
              Voice
            </Text>
          ) : null}
        </View>
      </Pressable>
      <PressableScale
        onPress={handleMenuPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`Actions for ${item.title ?? 'chat'}`}
        accessibilityRole="button">
        <View ref={menuRef} collapsable={false} style={styles.menuBtn}>
          <MoreVertical color={colors.textMuted} size={18} />
        </View>
      </PressableScale>
    </View>
  );
}

function NavRow({
  icon,
  label,
  onPress,
  badge,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  badge?: string;
  active?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <PressableScale onPress={onPress}>
      <View
        style={[
          styles.navRow,
          active && {
            backgroundColor: colors.primaryMuted,
            borderRadius: radii.lg,
          },
        ]}>
        {icon}
        <Text variant="bodyMedium" style={{ flex: 1 }}>
          {label}
        </Text>
        {badge ? (
          <Text variant="caption" muted>
            {badge}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

export function DrawerContent({ navigation }: DrawerContentProps) {
  const versionLines = getVersionDisplayLines();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const pathname = usePathname();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  useChatSidebarSync();

  const {
    sessions,
    nextCursor,
    refreshing,
    loadingMore,
    refresh,
    loadMore,
    renameSession,
    deleteSession,
  } = useChatSessions();

  const [actionsSession, setActionsSession] = useState<ChatSession | null>(null);
  const [actionsAnchor, setActionsAnchor] = useState<MenuAnchorRect | null>(null);
  const [chatsExpanded, setChatsExpanded] = useState(false);

  const isAssistantActive = pathname.includes('/assistant');
  const isSettingsActive = pathname.includes('/settings');
  const isNotesActive = pathname.includes('/notes');
  const isIntegrationsActive = pathname.includes('/integrations');
  const isAutomationsActive = pathname.includes('/automations');

  const composeLiveSessionId = useComposeDraftStore((s) => s.liveSessionId);
  const activeSessionId = resolveActiveChatSessionId(pathname, composeLiveSessionId);

  const visibleSessions = useMemo(
    () =>
      chatsExpanded
        ? sessions
        : getCollapsedSessions(sessions, activeSessionId),
    [chatsExpanded, sessions, activeSessionId]
  );

  const hasMoreChats =
    !chatsExpanded &&
    (sessions.length > visibleSessions.length || Boolean(nextCursor));

  const hiddenChatCount = Math.max(0, sessions.length - visibleSessions.length);

  useEffect(() => {
    setChatsExpanded(false);
  }, [pathname]);

  const closeAnd = useCallback(
    (fn: () => void) => {
      navigation.closeDrawer();
      fn();
    },
    [navigation]
  );

  const openSession = useCallback(
    (item: ChatSession) => {
      closeAnd(() => {
        router.push(
          chatSessionRoute(item.id, {
            title: item.title ?? undefined,
            kind: item.kind,
          })
        );
      });
    },
    [closeAnd]
  );

  const handleNewChat = useCallback(() => {
    closeAnd(() => {
      prepareNewCompose();
      router.replace(Routes.chatCompose);
    });
  }, [closeAnd]);

  const handleDelete = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      if (activeSessionId === sessionId) {
        prepareNewCompose();
        router.replace(Routes.chatCompose);
      }
    },
    [activeSessionId, deleteSession]
  );

  const user = session?.user;

  const handleMenuPress = useCallback((item: ChatSession, anchor: MenuAnchorRect) => {
    setActionsAnchor(anchor);
    setActionsSession(item);
  }, []);

  const renderSession = useCallback(
    ({ item }: { item: ChatSession }) => (
      <DrawerSessionRow
        item={item}
        isActive={item.id === activeSessionId}
        onOpen={openSession}
        onMenuPress={handleMenuPress}
      />
    ),
    [activeSessionId, handleMenuPress, openSession]
  );

  const listHeader = (
    <View style={{ paddingTop: insets.top }}>
      <View style={[styles.profile, { borderBottomColor: colors.border }]}>
        <UserAvatar
          image={user?.image}
          name={user?.name}
          email={user?.email}
          size={44}
        />
        <View style={styles.profileText}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {user?.name ?? 'Guest'}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
        <PressableScale
          onPress={() =>
            closeAnd(() => {
              router.push(Routes.settings);
            })
          }
          accessibilityLabel="Settings"
          accessibilityRole="button">
          <View
            style={[
              styles.settingsBtn,
              {
                backgroundColor: isSettingsActive
                  ? colors.primaryMuted
                  : colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}>
            <Settings
              color={isSettingsActive ? colors.primary : colors.text}
              size={20}
            />
          </View>
        </PressableScale>
      </View>

      <PressableScale onPress={handleNewChat} style={styles.newChatWrap}>
        <View style={[styles.newChatBtn, { backgroundColor: colors.primary }]}>
          <Pencil color={colors.onPrimary} size={18} />
          <Text variant="bodyMedium" style={{ color: colors.onPrimary }}>
            New Chat
          </Text>
        </View>
      </PressableScale>

      <Text variant="caption" muted style={styles.sectionLabel}>
        Recent chats
      </Text>
    </View>
  );

  const listFooter = (
    <View style={{ paddingBottom: insets.bottom + spacing.md }}>
      {hasMoreChats ? (
        <PressableScale
          onPress={() => setChatsExpanded(true)}
          accessibilityRole="button"
          accessibilityLabel="Show all chats">
          <View style={styles.expandTeaser}>
            <View style={styles.peekStack} pointerEvents="none">
              {[0, 1].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.peekRow,
                    {
                      opacity: 0.22 - i * 0.06,
                      marginTop: i === 0 ? 0 : -6,
                    },
                  ]}>
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: colors.surfaceElevated },
                    ]}
                  />
                  <View
                    style={[styles.peekBar, { backgroundColor: colors.border }]}
                  />
                </View>
              ))}
            </View>
            <LinearGradient
              colors={[`${colors.background}00`, colors.background]}
              style={styles.expandFade}
              pointerEvents="none"
            />
            <Text variant="caption" muted style={styles.expandLabel}>
              {hiddenChatCount > 0
                ? `Show all chats (${hiddenChatCount} more)`
                : 'Show all chats'}
            </Text>
          </View>
        </PressableScale>
      ) : null}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.navSection}>
        <NavRow
          icon={<AssistantIcon drawer size={26} />}
          label={assistantDisplayName}
          active={isAssistantActive}
          onPress={() =>
            closeAnd(() => {
              router.push(assistantRoute());
            })
          }
        />
        <NavRow
          icon={<DrawerColorIcon name="notes" drawer />}
          label="Notes"
          active={isNotesActive}
          onPress={() =>
            closeAnd(() => {
              router.push(Routes.notes);
            })
          }
        />
        <NavRow
          icon={<DrawerColorIcon name="connectApps" drawer />}
          label="Connect Apps"
          active={isIntegrationsActive}
          onPress={() =>
            closeAnd(() => {
              router.push(Routes.integrations);
            })
          }
        />
        <NavRow
          icon={<DrawerColorIcon name="automations" drawer />}
          label="Automations"
          active={isAutomationsActive}
          onPress={() =>
            closeAnd(() => {
              router.push(Routes.automations);
            })
          }
        />
      </View>

      <View style={[styles.signOutBar, { backgroundColor: colors.border }]} />

      <Pressable
        onPress={async () => {
          navigation.closeDrawer();
          await signOut();
          router.replace(Routes.welcome);
        }}
        style={styles.signOut}>
        <LogOut color={colors.danger} size={18} />
        <Text variant="bodyMedium" style={{ color: colors.danger }}>
          Sign out
        </Text>
      </Pressable>
      <Text variant="caption" muted style={styles.version}>
        v{versionLines.primary}
      </Text>
      {versionLines.secondary ? (
        <Text variant="caption" muted style={styles.versionSub}>
          {versionLines.secondary}
        </Text>
      ) : null}
    </View>
  );

  return (
    <>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <FlashList
          data={visibleSessions}
          keyExtractor={(item) => item.id}
          renderItem={renderSession}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
          onEndReached={
            chatsExpanded ? () => void loadMore() : undefined
          }
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            !refreshing ? (
              <View style={styles.empty}>
                <Text variant="caption" muted>
                  No chats yet
                </Text>
              </View>
            ) : null
          }
        />
      </View>

      <ChatSessionActionsModal
        session={actionsSession}
        visible={actionsSession != null}
        anchor={actionsAnchor}
        onClose={() => {
          setActionsSession(null);
          setActionsAnchor(null);
        }}
        onRename={async (sessionId, title) => {
          await renameSession(sessionId, title);
        }}
        onDelete={handleDelete}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
  },
  sectionLabel: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.sm,
    marginVertical: 3,
    borderRadius: radii.lg,
    paddingRight: spacing.xs,
    overflow: 'hidden',
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    minHeight: 48,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  generatingRow: {
    height: 18,
    justifyContent: 'center',
  },
  menuBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  expandTeaser: {
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    minHeight: 72,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  peekStack: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    top: 0,
  },
  peekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    minHeight: 44,
  },
  peekBar: {
    flex: 1,
    height: 10,
    borderRadius: radii.sm,
    marginRight: spacing.xl,
  },
  expandFade: {
    ...StyleSheet.absoluteFill,
  },
  expandLabel: {
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
  },
  navSection: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  signOutBar: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  version: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  versionSub: {
    paddingHorizontal: spacing.md,
    paddingTop: 2,
    paddingBottom: spacing.sm,
  },
});
