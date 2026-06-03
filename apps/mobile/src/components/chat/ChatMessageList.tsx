import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import type { ChatMessage } from '@ai-assistant/types/chat';
import { spacing } from '@/theme/tokens';
import { messageAssistantLabel } from '@/features/chat/chatMessage';
import { ChatMessageBubble } from './ChatMessageBubble';
import { Text } from '@/components/ui/Text';
import { useSavedNotesStore } from '@/features/notes/savedNotesStore';
import { STREAMING_MESSAGE_ID } from '@/features/chat/buildStreamingMessages';

function lastUserMessageText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'USER') {
      return messages[i].content?.trim() ?? '';
    }
  }
  return '';
}

type Props = {
  messages: ChatMessage[];
  visibleText: string;
  isStreaming: boolean;
  isGenerating?: boolean;
  showStreamCursor?: boolean;
  streamTurnKey?: number;
  emptyHint?: string;
  contentPaddingBottom?: number;
  savedMessageIds?: Set<string>;
  streamingAssistantLabel?: string;
  streamRevision?: number;
  streamStatusMessage?: string | null;
  onSaveNote?: (content: string, messageId: string) => Promise<void>;
};

export type ChatMessageListHandle = {
  scrollToEnd: (animated?: boolean) => void;
};

export const ChatMessageList = forwardRef<ChatMessageListHandle, Props>(function ChatMessageList({
  messages,
  visibleText,
  isStreaming,
  isGenerating = false,
  showStreamCursor = true,
  streamTurnKey = 0,
  emptyHint,
  contentPaddingBottom,
  savedMessageIds,
  streamingAssistantLabel,
  streamRevision = 0,
  streamStatusMessage,
  onSaveNote,
}, ref) {
  const listRef = useRef<FlashListRef<ChatMessage>>(null);
  const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRevision = useSavedNotesStore((s) => s.revision);
  const thinkingUserMessage = useMemo(() => lastUserMessageText(messages), [messages]);

  const scrollToEnd = useCallback(
    (animated = true) => {
      if (messages.length === 0) return;
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated });
      });
    },
    [messages.length]
  );

  useImperativeHandle(ref, () => ({ scrollToEnd }), [scrollToEnd]);

  useEffect(() => {
    const animated = !isStreaming && !isGenerating;
    if (animated) {
      scrollToEnd(true);
      return;
    }

    if (scrollThrottleRef.current != null) return;
    scrollThrottleRef.current = setTimeout(() => {
      scrollThrottleRef.current = null;
      scrollToEnd(false);
    }, 250);

    return () => {
      if (scrollThrottleRef.current != null) {
        clearTimeout(scrollThrottleRef.current);
        scrollThrottleRef.current = null;
      }
    };
  }, [messages.length, streamRevision, isStreaming, isGenerating, scrollToEnd]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scrollToEnd(true));
    return () => sub.remove();
  }, [scrollToEnd]);

  const renderItem: ListRenderItem<ChatMessage> = useCallback(
    ({ item }) => {
      const isStreamRow = item.id === STREAMING_MESSAGE_ID;
      return (
        <ChatMessageBubble
          message={item}
          assistantLabel={messageAssistantLabel(item, streamingAssistantLabel)}
          showGeneratingSpinner={isStreamRow && isGenerating}
          showStreamCursor={isStreamRow && showStreamCursor && isStreaming}
          streamActive={isStreamRow && (isStreaming || isGenerating)}
          streamTurnKey={streamTurnKey}
          thinkingUserMessage={isStreamRow ? thinkingUserMessage : undefined}
          streamStatusMessage={isStreamRow ? streamStatusMessage : undefined}
          isSaved={savedMessageIds?.has(item.id) ?? false}
          onSaveNote={onSaveNote}
        />
      );
    },
    [
      streamingAssistantLabel,
      isGenerating,
      isStreaming,
      onSaveNote,
      savedMessageIds,
      showStreamCursor,
      streamTurnKey,
      thinkingUserMessage,
      streamStatusMessage,
    ]
  );

  if (messages.length === 0 && emptyHint) {
    return (
      <View style={[styles.listContainer, styles.emptyWrap]}>
        <Text variant="body" muted style={styles.emptyHint}>
          {emptyHint}
        </Text>
      </View>
    );
  }

  return (
    <FlashList
      ref={listRef}
      data={messages}
      extraData={`${streamRevision}|${isStreaming}|${isGenerating}|${streamTurnKey}|${savedRevision}`}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[
        styles.list,
        contentPaddingBottom != null
          ? { paddingBottom: contentPaddingBottom }
          : null,
      ]}
      style={styles.listContainer}
      renderItem={renderItem}
    />
  );
});

const styles = StyleSheet.create({
  listContainer: { flex: 1 },
  list: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyHint: {
    textAlign: 'center',
  },
});
