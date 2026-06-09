import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { ChevronDown } from 'lucide-react-native';
import type { ChatMessage } from '@ai-assistant/types/chat';
import { spacing, radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { messageAssistantLabel } from '@/features/chat/chatMessage';
import { ChatMessageBubble } from './ChatMessageBubble';
import { Text } from '@/components/ui/Text';
import { useSavedNotesStore } from '@/features/notes/savedNotesStore';
import { STREAMING_MESSAGE_ID } from '@/features/chat/buildStreamingMessages';
import { isImageGenerationTurn } from '@/features/chat/isImageGenerationTurn';

const NEAR_BOTTOM_THRESHOLD = 96;

function isNearBottom(event: NativeScrollEvent): boolean {
  const { contentOffset, contentSize, layoutMeasurement } = event;
  if (contentSize.height <= layoutMeasurement.height) return true;
  const distanceFromBottom =
    contentSize.height - layoutMeasurement.height - contentOffset.y;
  return distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;
}

function lastUserMessageText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'USER') {
      return messages[i].content?.trim() ?? '';
    }
  }
  return '';
}

type Props = {
  backgroundColor?: string;
  messages: ChatMessage[];
  visibleText: string;
  isStreaming: boolean;
  isGenerating?: boolean;
  isImageGenerating?: boolean;
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
  backgroundColor,
  messages,
  visibleText,
  isStreaming,
  isGenerating = false,
  isImageGenerating = false,
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
  const { colors } = useTheme();
  const listRef = useRef<FlashListRef<ChatMessage>>(null);
  const pinnedToBottomRef = useRef(true);
  const userDraggingRef = useRef(false);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const savedRevision = useSavedNotesStore((s) => s.revision);
  const thinkingUserMessage = useMemo(() => lastUserMessageText(messages), [messages]);
  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'USER') return messages[i];
    }
    return undefined;
  }, [messages]);
  const streamActive = isStreaming || isGenerating;

  const scrollToEnd = useCallback(
    (animated = true) => {
      if (messages.length === 0) return;
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated });
      });
    },
    [messages.length]
  );

  const unpinFromBottom = useCallback(() => {
    if (!pinnedToBottomRef.current) return;
    pinnedToBottomRef.current = false;
    setPinnedToBottom(false);
  }, []);

  const scrollToEndIfPinned = useCallback(
    (animated = true) => {
      if (!pinnedToBottomRef.current || userDraggingRef.current) return;
      scrollToEnd(animated);
    },
    [scrollToEnd]
  );

  const jumpToLatest = useCallback(() => {
    pinnedToBottomRef.current = true;
    setPinnedToBottom(true);
    scrollToEnd(true);
  }, [scrollToEnd]);

  const syncPinnedFromScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nearBottom = isNearBottom(event.nativeEvent);
    if (pinnedToBottomRef.current === nearBottom) return;
    pinnedToBottomRef.current = nearBottom;
    setPinnedToBottom(nearBottom);
  }, []);

  const handleScrollBeginDrag = useCallback(() => {
    userDraggingRef.current = true;
    unpinFromBottom();
  }, [unpinFromBottom]);

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      userDraggingRef.current = false;
      syncPinnedFromScroll(event);
    },
    [syncPinnedFromScroll]
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      userDraggingRef.current = false;
      syncPinnedFromScroll(event);
    },
    [syncPinnedFromScroll]
  );

  useImperativeHandle(ref, () => ({ scrollToEnd: jumpToLatest }), [jumpToLatest]);

  useEffect(() => {
    pinnedToBottomRef.current = true;
    setPinnedToBottom(true);
    scrollToEnd(false);
  }, [streamTurnKey, scrollToEnd]);

  useEffect(() => {
    if (messages.length === 0) return;
    if (!streamActive) {
      scrollToEndIfPinned(true);
    }
  }, [messages.length, streamActive, scrollToEndIfPinned]);

  useEffect(() => {
    if (!streamActive || !pinnedToBottomRef.current || userDraggingRef.current) return;
    scrollToEnd(false);
  }, [streamRevision, visibleText, streamActive, scrollToEnd]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scrollToEndIfPinned(true));
    return () => sub.remove();
  }, [scrollToEndIfPinned]);

  const renderItem: ListRenderItem<ChatMessage> = useCallback(
    ({ item }) => {
      const isStreamRow = item.id === STREAMING_MESSAGE_ID;
      const showImageSkeleton =
        isStreamRow &&
        isGenerating &&
        !item.attachments?.length &&
        (isImageGenerating ||
          isImageGenerationTurn(thinkingUserMessage, lastUserMessage));
      return (
        <View style={styles.row}>
          <ChatMessageBubble
            message={item}
            assistantLabel={messageAssistantLabel(item, streamingAssistantLabel)}
            showGeneratingSpinner={isStreamRow && isGenerating}
            showStreamCursor={isStreamRow && showStreamCursor && isStreaming}
            streamActive={isStreamRow && streamActive}
            streamTurnKey={streamTurnKey}
            thinkingUserMessage={isStreamRow ? thinkingUserMessage : undefined}
            streamStatusMessage={isStreamRow ? streamStatusMessage : undefined}
            showImageSkeleton={showImageSkeleton}
            isSaved={savedMessageIds?.has(item.id) ?? false}
            onSaveNote={onSaveNote}
          />
        </View>
      );
    },
    [
      streamingAssistantLabel,
      isGenerating,
      isImageGenerating,
      isStreaming,
      streamActive,
      onSaveNote,
      savedMessageIds,
      showStreamCursor,
      streamTurnKey,
      thinkingUserMessage,
      lastUserMessage,
      streamStatusMessage,
    ]
  );

  if (messages.length === 0 && emptyHint) {
    return (
      <View style={[styles.listContainer, styles.emptyWrap, backgroundColor ? { backgroundColor } : null]}>
        <Text variant="body" muted style={styles.emptyHint}>
          {emptyHint}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.listContainer, backgroundColor ? { backgroundColor } : null]}>
      <FlashList
        ref={listRef}
        data={messages}
        extraData={`${streamRevision}|${visibleText.length}|${streamActive}|${streamTurnKey}|${savedRevision}|${pinnedToBottom}`}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          contentPaddingBottom != null
            ? { paddingBottom: contentPaddingBottom }
            : null,
        ]}
        style={styles.listFill}
        renderItem={renderItem}
        onScroll={syncPinnedFromScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
      />
      {streamActive && !pinnedToBottom ? (
        <Pressable
          onPress={jumpToLatest}
          style={[
            styles.jumpBtn,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Jump to latest message">
          <ChevronDown color={colors.primary} size={18} strokeWidth={2.5} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  listContainer: { flex: 1 },
  listFill: { flex: 1 },
  jumpBtn: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  row: {
    flexGrow: 0,
    flexShrink: 0,
  },
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
