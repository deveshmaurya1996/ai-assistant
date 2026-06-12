import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useDrawerProgress } from 'react-native-drawer-layout';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ChevronDown, LogOut, Pencil, Settings } from 'lucide-react-native';
import type { ChatSession } from '@ai-assistant/sdk';
import { Text } from '@/components/ui/Text';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { DrawerColorIcon } from '@/components/layout/DrawerColorIcon';
import { AssistantIcon } from '@/components/assistant/AssistantIcon';
import { ChatSessionActionsModal, type MenuAnchorRect } from '@/components/chat/ChatSessionActionsModal';
import { ShareChatSheet } from '@/components/share/ShareChatSheet';
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
import { shouldShowSidebarAttentionDot } from '@/features/chat/sidebarAttention';
import { useSettingsStore } from '@/stores/settings';
import { MessageSquare, Mic, MoreVertical } from 'lucide-react-native';
import { getVersionDisplayLines } from '@/lib/version-display';

type DrawerContentProps = {
  navigation: { closeDrawer: () => void };
};

const COLLAPSED_CHAT_COUNT = 3;

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

const DrawerSessionRow = memo(function DrawerSessionRow({
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
    Boolean(s.generatingSessionKeys[item.id])
  );
  const showAttentionDot = shouldShowSidebarAttentionDot(
    item.hasUnread,
    isGenerating,
    isActive
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
          <View style={styles.titleRow}>
            {showAttentionDot ? (
              <View
                style={[styles.attentionDot, { backgroundColor: colors.danger }]}
              />
            ) : null}
            <Text variant="bodyMedium" numberOfLines={1} style={styles.titleText}>
              {item.title ?? (isVoice ? 'Voice chat' : 'Untitled')}
            </Text>
          </View>
          {!showAttentionDot && isVoice ? (
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
});

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
  const [shareTarget, setShareTarget] = useState<{ id: string; title: string } | null>(null);
  const shareSheetRef = useRef<BottomSheetModal>(null);
  const [chatsExpanded, setChatsExpanded] = useState(false);
  const drawerProgress = useDrawerProgress();
  const pendingAfterCloseRef = useRef<(() => void) | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);

  useAnimatedReaction(
    () => drawerProgress.value > 0.5,
    (open, previous) => {
      if (previous === null || open === previous) return;
      scheduleOnRN(setDrawerOpen, open);
    },
    [drawerProgress]
  );

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

  useEffect(() => {
    if (drawerOpen) return;
    const fn = pendingAfterCloseRef.current;
    if (!fn) return;
    pendingAfterCloseRef.current = null;
    fn();
  }, [drawerOpen]);

  const closeAnd = useCallback(
    (fn: () => void) => {
      if (!drawerOpen) {
        fn();
        return;
      }

      pendingAfterCloseRef.current = fn;
      navigation.closeDrawer();

      setTimeout(() => {
        if (pendingAfterCloseRef.current !== fn) return;
        pendingAfterCloseRef.current = null;
        fn();
      }, 420);
    },
    [drawerOpen, navigation]
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

  const drawerTop = useMemo(
    () => (
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
    ),
    [
      closeAnd,
      colors.border,
      colors.onPrimary,
      colors.primary,
      colors.primaryMuted,
      colors.surfaceElevated,
      colors.text,
      handleNewChat,
      insets.top,
      isSettingsActive,
      user?.email,
      user?.image,
      user?.name,
    ]
  );

  const chatListFooter = useMemo(
    () =>
      loadingMore ? (
        <ActivityIndicator color={colors.primary} style={styles.loadingMore} />
      ) : null,
    [colors.primary, loadingMore]
  );

  const showAllChatsLabel =
    hiddenChatCount > 0
      ? `Show all chats (${hiddenChatCount} more)`
      : 'Show all chats';

  const drawerBottom = useMemo(
    () => (
    <View style={{ paddingBottom: insets.bottom + spacing.md }}>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.navSection}>
        <NavRow
          icon={<AssistantIcon drawer size={24} inset={0} />}
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
          label="Scheduler"
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
    ),
    [
      assistantDisplayName,
      closeAnd,
      colors.border,
      colors.danger,
      insets.bottom,
      isAssistantActive,
      isAutomationsActive,
      isIntegrationsActive,
      isNotesActive,
      navigation,
      signOut,
      versionLines.primary,
      versionLines.secondary,
    ]
  );

  return (
    <>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {drawerTop}
        <View style={styles.chatSection}>
          <FlashList
            style={styles.chatList}
            data={visibleSessions}
            extraData={`${activeSessionId}|${refreshing}|${loadingMore}|${chatsExpanded}`}
            keyExtractor={(item) => item.id}
            renderItem={renderSession}
            ListFooterComponent={chatListFooter}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
            }
            onEndReached={
              chatsExpanded ? () => void loadMore() : undefined
            }
            onEndReachedThreshold={0.4}
            keyboardShouldPersistTaps="handled"
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
          {hasMoreChats ? (
            <View style={styles.showAllFooter}>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <PressableScale
                onPress={() => setChatsExpanded(true)}
                accessibilityRole="button"
                accessibilityLabel={showAllChatsLabel}>
                <View style={styles.showAllBtn}>
                  <Text variant="caption" muted numberOfLines={1}>
                    {showAllChatsLabel}
                  </Text>
                  <ChevronDown color={colors.textMuted} size={14} strokeWidth={2.25} />
                </View>
              </PressableScale>
            </View>
          ) : null}
        </View>
        {drawerBottom}
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
        onShare={(sessionId) => {
          setShareTarget({
            id: sessionId,
            title: actionsSession?.title ?? 'Chat',
          });
          requestAnimationFrame(() => shareSheetRef.current?.present());
        }}
      />
      <ShareChatSheet
        ref={shareSheetRef}
        sessionId={shareTarget?.id ?? null}
        title={shareTarget?.title}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  chatSection: {
    flex: 1,
    minHeight: 0,
  },
  chatList: {
    flex: 1,
  },
  showAllFooter: {
    flexShrink: 0,
  },
  showAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 32,
  },
  loadingMore: {
    paddingVertical: spacing.md,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titleText: {
    flex: 1,
    flexShrink: 1,
  },
  attentionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
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
