import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { router } from 'expo-router';
import type { ChatMessage, ChatSessionKind } from '@ai-assistant/sdk';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { ChatComposer, type ChatSendPayload } from '@/components/chat/ChatComposer';
import {
  ChatSessionActionsModal,
  type MenuAnchorRect,
} from '@/components/chat/ChatSessionActionsModal';
import {
  ChatMessageList,
  type ChatMessageListHandle,
} from '@/components/chat/ChatMessageList';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { Routes } from '@/lib/routes';
import { useChatSessions } from '@/features/chat/useChatSessions';
import { useChatSidebarStore } from '@/features/chat/chatSidebarStore';
import { clearSidebarAttention } from '@/features/chat/sidebarAttention';
import { apiClient } from '@/lib/api-client';
import { useGradualKeyboardAnimation } from '@/hooks/useGradualKeyboardAnimation';
import { ShareChatSheet } from '@/components/share/ShareChatSheet';
import { AppNavigationGestureHost } from '@/components/layout/AppNavigationGestureHost';

type ChatScreenShellProps = {
  title: string;
  subtitle?: string;
  sessionId?: string;
  sessionKind?: ChatSessionKind;
  onSessionRenamed?: (title: string) => void;
  banner?: ReactNode;
  messages: ChatMessage[];
  visibleText: string;
  streamTurnKey?: number;
  isStreaming: boolean;
  isGenerating: boolean;
  isImageGenerating?: boolean;
  streamStatusMessage?: string | null;
  streamRevision?: number;
  emptyHint?: string;
  savedMessageIds: Set<string>;
  assistantLabel: string;
  onSaveNote?: (content: string, messageId?: string) => Promise<void>;
  onSend: (payload: ChatSendPayload) => void | boolean | Promise<boolean>;
  onStop?: () => void;
};

export function ChatScreenShell({
  title,
  subtitle,
  sessionId,
  sessionKind = 'text',
  onSessionRenamed,
  banner,
  messages,
  visibleText,
  streamTurnKey,
  isStreaming,
  isGenerating,
  isImageGenerating = false,
  streamStatusMessage,
  streamRevision = 0,
  emptyHint,
  savedMessageIds,
  assistantLabel,
  onSaveNote,
  onSend,
  onStop,
}: ChatScreenShellProps) {
  const { colors, screenStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight, progress: keyboardProgress } = useGradualKeyboardAnimation();
  const messageListRef = useRef<ChatMessageListHandle>(null);
  const shareSheetRef = useRef<BottomSheetModal>(null);
  const safeBottom = insets.bottom;
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsAnchor, setActionsAnchor] = useState<MenuAnchorRect | null>(null);
  const { renameSession, deleteSession } = useChatSessions();
  const patchUnread = useChatSidebarStore((s) => s.patchUnread);

  useEffect(() => {
    if (!sessionId) return;
    clearSidebarAttention(sessionId);
    void apiClient.markSessionRead(sessionId).then(() => {
      patchUnread(sessionId, false);
    }).catch(() => {});
  }, [sessionId, patchUnread]);

  const composerInsetStyle = useAnimatedStyle(() => ({
    paddingBottom:
      keyboardHeight.value + spacing.sm + (1 - keyboardProgress.value) * safeBottom,
  }));

  const sessionForModal = useMemo(
    () =>
      sessionId
        ? { id: sessionId, title, kind: sessionKind, messageCount: messages.length }
        : null,
    [sessionId, title, sessionKind, messages.length]
  );

  const handleRename = useCallback(
    async (id: string, newTitle: string) => {
      await renameSession(id, newTitle);
      onSessionRenamed?.(newTitle);
    },
    [renameSession, onSessionRenamed]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteSession(id);
      router.replace(Routes.chatCompose);
    },
    [deleteSession]
  );

  return (
    <AppNavigationGestureHost>
      <View style={[styles.container, screenStyle]}>
        <ScreenHeader
        title={title}
        subtitle={subtitle}
        variant="chat"
        leading="menu"
        trailing={sessionId ? 'more' : null}
        onTrailingPress={(anchor) => {
          setActionsAnchor(anchor);
          setActionsOpen(true);
        }}
        titleAlign="center"
      />

      {banner}

      <ChatMessageList
        ref={messageListRef}
        backgroundColor={colors.background}
        messages={messages}
        visibleText={visibleText}
        streamTurnKey={streamTurnKey}
        isStreaming={isStreaming}
        isGenerating={isGenerating}
        isImageGenerating={isImageGenerating}
        streamStatusMessage={streamStatusMessage}
        emptyHint={emptyHint}
        savedMessageIds={savedMessageIds}
        streamingAssistantLabel={assistantLabel}
        streamRevision={streamRevision}
        onSaveNote={onSaveNote}
      />

      <Animated.View style={[{ backgroundColor: colors.background }, composerInsetStyle]}>
        <ChatComposer
          onSend={onSend}
          sendDisabled={isGenerating}
          isGenerating={isGenerating}
          onStop={onStop}
          onInputFocus={() => messageListRef.current?.scrollToEnd(true)}
        />
      </Animated.View>

      <ChatSessionActionsModal
        session={actionsOpen ? sessionForModal : null}
        visible={actionsOpen}
        anchor={actionsAnchor}
        anchorOffsetY={40}
        onClose={() => {
          setActionsOpen(false);
          setActionsAnchor(null);
        }}
        onRename={handleRename}
        onDelete={handleDelete}
        onShare={() => shareSheetRef.current?.present()}
      />
      <ShareChatSheet
        ref={shareSheetRef}
        sessionId={sessionId ?? null}
        title={title}
      />
      </View>
    </AppNavigationGestureHost>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
