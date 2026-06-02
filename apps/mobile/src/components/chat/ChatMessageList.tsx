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
import type { ChatMessage } from '@ai-assistant/sdk';
import { spacing } from '@/theme/tokens';
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
  assistantLabel?: string;
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
  assistantLabel,
  onSaveNote,
}, ref) {
  const listRef = useRef<FlashListRef<ChatMessage>>(null);
  const scrollRafRef = useRef<number | null>(null);
  const savedRevision = useSavedNotesStore((s) => s.revision);
  const thinkingUserMessage = useMemo(() => lastUserMessageText(messages), [messages]);
  const streamTick = isStreaming || isGenerating ? visibleText.length : 0;

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

    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      scrollToEnd(false);
    });

    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [messages.length, streamTick, isStreaming, isGenerating, scrollToEnd]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scrollToEnd(true));
    return () => sub.remove();
  }, [scrollToEnd]);

  const renderItem: ListRenderItem<ChatMessage> = useCallback(
    ({ item }) => (
      <ChatMessageBubble
        message={item}
        assistantLabel={item.role === 'ASSISTANT' ? assistantLabel : undefined}
        showGeneratingSpinner={isGenerating}
        showStreamCursor={showStreamCursor && isStreaming}
        streamActive={isStreaming || isGenerating}
        streamTurnKey={streamTurnKey}
        thinkingUserMessage={
          item.id === STREAMING_MESSAGE_ID ? thinkingUserMessage : undefined
        }
        isSaved={savedMessageIds?.has(item.id) ?? false}
        onSaveNote={onSaveNote}
      />
    ),
    [
      assistantLabel,
      isGenerating,
      isStreaming,
      onSaveNote,
      savedMessageIds,
      showStreamCursor,
      streamTurnKey,
      thinkingUserMessage,
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
      extraData={`${streamTick}|${isStreaming}|${isGenerating}|${streamTurnKey}|${savedRevision}|${assistantLabel ?? ''}`}
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
