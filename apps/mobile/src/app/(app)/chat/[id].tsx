import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {
  FlashList,
  type FlashListRef,
  type ListRenderItem,
} from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Mic, Send } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient, type AssistantSocket, type ChatMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { useVoice } from '@/context/VoiceContext';
import { spacing, radii } from '@/theme/tokens';
import { PressableScale } from '@/components/motion/PressableScale';

const STREAMING_MESSAGE_ID = 'stream';

function isUserMessage(message: ChatMessage): boolean {
  return message.role === 'USER';
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useAuthStore((s) => s.session);
  const defaultRag = useSettingsStore((s) => s.defaultRagEnabled);
  const { openVoiceSheet } = useVoice();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const listRef = useRef<FlashListRef<ChatMessage>>(null);
  const socketRef = useRef<AssistantSocket | null>(null);

  useEffect(() => {
    if (!id || !session?.session?.token) return;

    void apiClient.getMessages(id).then(setMessages);

    const socket = apiClient.connectSocket(session.session.token);
    socketRef.current = socket;

    socket.on('chat:chunk', (data) => {
      setStreaming((prev) => prev + data.chunk);
    });

    socket.on('chat:end', (data) => {
      setMessages((prev) => [...prev, data.message]);
      setStreaming('');
      setIsGenerating(false);
    });

    socket.on('chat:error', () => {
      setStreaming('');
      setIsGenerating(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [id, session?.session?.token]);

  const emitMessage = useCallback(
    (text: string) => {
      if (!text.trim() || !socketRef.current || !id) return;
      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'USER',
        content: text,
      };
      setMessages((prev) => [...prev, optimistic]);
      setStreaming('');
      setIsGenerating(true);
      socketRef.current.emit('chat:message', {
        text,
        chatSessionId: id,
        ragEnabled: defaultRag,
      });
    },
    [id, defaultRag]
  );

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    emitMessage(text);
  };

  const displayMessages: ChatMessage[] =
    streaming || isGenerating
      ? [
          ...messages,
          {
            id: STREAMING_MESSAGE_ID,
            role: 'ASSISTANT',
            content: streaming,
          },
        ]
      : messages;

  useEffect(() => {
    if (!streaming && !isGenerating) return;
    listRef.current?.scrollToEnd({ animated: true });
  }, [streaming, isGenerating, displayMessages.length]);

  const renderMessage: ListRenderItem<ChatMessage> = ({ item }) => {
    const isUser = isUserMessage(item);
    const isStreamingBubble = item.id === STREAMING_MESSAGE_ID;
    return (
      <View
        style={[
          styles.bubble,
          {
            alignSelf: isUser ? 'flex-end' : 'flex-start',
            backgroundColor: isUser ? colors.primary : colors.surfaceElevated,
            borderColor: colors.border,
            borderWidth: isUser ? 0 : 1,
          },
        ]}>
        {isStreamingBubble && !item.content && isGenerating ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <Text style={{ color: isUser ? colors.onPrimary : colors.text }}>
            {item.content}
          </Text>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + spacing.sm,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}>
        <PressableScale onPress={() => router.back()}>
          <ArrowLeft color={colors.text} size={24} />
        </PressableScale>
        <Text variant="h2" style={{ flex: 1, marginLeft: spacing.md }}>
          Chat
        </Text>
      </View>

      <FlashList
        ref={listRef}
        data={displayMessages}
        extraData={`${streaming}|${isGenerating}`}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        style={styles.messageList}
        renderItem={renderMessage}
      />

      <View
        style={[
          styles.inputRow,
          {
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
            paddingBottom: insets.bottom + spacing.sm,
          },
        ]}>
        <Pressable
          onPress={() =>
            openVoiceSheet({
              onTranscript: (text) => {
                setInput(text);
                emitMessage(text);
              },
            })
          }
          style={[styles.micBtn, { backgroundColor: colors.primaryMuted }]}>
          <Mic color={colors.primary} size={22} />
        </Pressable>
        <Input
          value={input}
          onChangeText={setInput}
          placeholder="Message…"
          multiline
          style={styles.input}
        />
        <PressableScale onPress={send}>
          <View style={[styles.send, { backgroundColor: colors.primary }]}>
            <Send color={colors.onPrimary} size={20} />
          </View>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  messageList: { flex: 1 },
  list: { padding: spacing.md, paddingBottom: spacing.lg },
  bubble: {
    padding: spacing.md,
    borderRadius: radii.lg,
    maxWidth: '85%',
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, maxHeight: 120 },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
