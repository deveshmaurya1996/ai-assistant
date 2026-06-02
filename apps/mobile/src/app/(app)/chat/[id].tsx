import { useRef } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, AudioLines } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/tokens';
import { PressableScale } from '@/components/motion/PressableScale';
import { useChatRoom } from '@/features/chat/useChatRoom';
import { useSaveNote } from '@/features/notes/useSaveNote';
import {
  ChatMessageList,
  type ChatMessageListHandle,
} from '@/components/chat/ChatMessageList';
import { ChatComposer } from '@/components/chat/ChatComposer';
import {
  getAssistantSubtitle,
  useSettingsStore,
} from '@/stores/settings';

export default function ChatScreen() {
  const { id, title: titleParam, kind: kindParam } = useLocalSearchParams<{
    id: string;
    title?: string;
    kind?: string;
  }>();
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
  const messageListRef = useRef<ChatMessageListHandle>(null);

  const {
    title,
    isVoice,
    displayMessages,
    visibleText,
    streamTurnKey,
    isStreaming,
    isGenerating,
    send,
    stopGeneration,
    savedMessageIds,
  } = useChatRoom({
    sessionId: id,
    initialTitle: titleParam,
    initialKind: kindParam,
  });

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
            {isVoice ? `${assistantSubtitle} · Voice chat` : assistantSubtitle}
          </Text>
        </View>
      </View>

      {isVoice && id ? (
        <View
          style={[
            styles.voiceBanner,
            { backgroundColor: colors.primaryMuted, borderBottomColor: colors.border },
          ]}>
          <AudioLines color={colors.primary} size={18} />
          <Text variant="caption" style={{ color: colors.primary, flex: 1 }}>
            Voice chat — type below or resume hands-free on Assistant
          </Text>
          <PressableScale
            onPress={() =>
              router.push({
                pathname: '/(app)/(main)/assistant',
                params: { resumeSessionId: id },
              })
            }>
            <View style={[styles.resumeBtn, { backgroundColor: colors.primary }]}>
              <Text variant="caption" style={{ color: colors.onPrimary }}>
                Resume voice
              </Text>
            </View>
          </PressableScale>
        </View>
      ) : null}

      <ChatMessageList
        ref={messageListRef}
        messages={displayMessages}
        visibleText={visibleText}
        streamTurnKey={streamTurnKey}
        isStreaming={isStreaming}
        isGenerating={isGenerating}
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
  voiceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resumeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
  },
});
