import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import type { ChatMessage } from '@ai-assistant/sdk';
import { spacing } from '@/theme/tokens';
import { ChatMessageBubble } from './ChatMessageBubble';
import { Text } from '@/components/ui/Text';

type Props = {
  messages: ChatMessage[];
  visibleText: string;
  isStreaming: boolean;
  isGenerating?: boolean;
  showStreamCursor?: boolean;
  emptyHint?: string;
  contentPaddingBottom?: number;
};

export function ChatMessageList({
  messages,
  visibleText,
  isStreaming,
  isGenerating = false,
  showStreamCursor = true,
  emptyHint,
  contentPaddingBottom,
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
      extraData={`${visibleText}|${isStreaming}|${isGenerating}`}
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
}

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
