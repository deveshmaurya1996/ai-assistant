import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import type { ChatMessage } from '@ai-assistant/sdk';
import { spacing } from '@/theme/tokens';
import { ChatMessageBubble } from './ChatMessageBubble';

type Props = {
  messages: ChatMessage[];
  visibleText: string;
  isStreaming: boolean;
  isGenerating?: boolean;
  showStreamCursor?: boolean;
};

export function ChatMessageList({
  messages,
  visibleText,
  isStreaming,
  isGenerating = false,
  showStreamCursor = true,
}: Props) {
  const listRef = useRef<FlashListRef<ChatMessage>>(null);

  useEffect(() => {
    if (messages.length === 0) return;
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, visibleText, isStreaming]);

  const renderItem: ListRenderItem<ChatMessage> = ({ item }) => (
    <ChatMessageBubble
      message={item}
      showGeneratingSpinner={isGenerating}
      showStreamCursor={showStreamCursor && isStreaming}
    />
  );

  return (
    <FlashList
      ref={listRef}
      data={messages}
      extraData={`${visibleText}|${isStreaming}|${isGenerating}`}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      style={styles.listContainer}
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  listContainer: { flex: 1 },
  list: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
});
