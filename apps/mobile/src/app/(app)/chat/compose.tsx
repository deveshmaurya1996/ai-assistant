import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/tokens';
import { PressableScale } from '@/components/motion/PressableScale';
import { apiClient } from '@/lib/api-client';
import { formatApiError } from '@/lib/format-ai-error';
import { useChatRoom } from '@/features/chat/useChatRoom';
import { useSaveNote } from '@/features/notes/useSaveNote';
import {
  ChatMessageList,
  type ChatMessageListHandle,
} from '@/components/chat/ChatMessageList';
import { ChatComposer, type ChatSendPayload } from '@/components/chat/ChatComposer';
import {
  getAssistantSubtitle,
  useSettingsStore,
} from '@/stores/settings';

export default function ChatComposeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const saveNote = useSaveNote();
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const selectedPersonalityId = useSettingsStore((s) => s.selectedPersonalityId);
  const personalities = useSettingsStore((s) => s.personalities);
  const assistantSubtitle = getAssistantSubtitle(
    assistantDisplayName,
    selectedPersonalityId,
    personalities
  );
  const [liveSessionId, setLiveSessionId] = useState<string | undefined>();
  const liveSessionIdRef = useRef<string | undefined>(undefined);
  const titleRef = useRef('New chat');
  const userSentRef = useRef(false);
  const messageListRef = useRef<ChatMessageListHandle>(null);

  liveSessionIdRef.current = liveSessionId;

  useEffect(() => {
    return () => {
      if (userSentRef.current) return;
      const sid = liveSessionIdRef.current;
      if (!sid) return;
      void (async () => {
        try {
          const msgs = await apiClient.getMessages(sid);
          if (msgs.length === 0) {
            await apiClient.deleteSession(sid);
          }
        } catch (err) {
          if (__DEV__) {
            console.warn(
              '[compose] cleanup empty session failed:',
              formatApiError(err),
              err
            );
          }
        }
      })();
    };
  }, []);

  const handleSessionCreated = useCallback((sessionId: string) => {
    setLiveSessionId(sessionId);
    router.replace({
      pathname: '/(app)/chat/[id]',
      params: { id: sessionId, title: titleRef.current },
    });
  }, []);

  const {
    title,
    displayMessages,
    visibleText,
    streamTurnKey,
    isStreaming,
    isGenerating,
    send: roomSend,
    stopGeneration,
    savedMessageIds,
  } = useChatRoom({
    sessionId: liveSessionId,
    initialTitle: 'New chat',
    onSessionCreated: handleSessionCreated,
  });

  titleRef.current = title;

  const send = useCallback(
    (payload: ChatSendPayload) => {
      userSentRef.current = true;
      return roomSend(payload);
    },
    [roomSend]
  );

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
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text variant="h2" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {assistantSubtitle}
          </Text>
        </View>
      </View>

      <ChatMessageList
        ref={messageListRef}
        messages={displayMessages}
        visibleText={visibleText}
        streamTurnKey={streamTurnKey}
        isStreaming={isStreaming}
        isGenerating={isGenerating}
        emptyHint="Send a message to start"
        savedMessageIds={savedMessageIds}
        assistantLabel={assistantDisplayName}
        onSaveNote={saveNote}
      />

      <ChatComposer
        onSend={send}
        sendDisabled={isGenerating}
        isGenerating={isGenerating}
        onStop={stopGeneration}
        onInputFocus={() => messageListRef.current?.scrollToEnd(true)}
      />
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
});
