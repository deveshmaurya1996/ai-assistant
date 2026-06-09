import { View, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AudioLines } from 'lucide-react-native';
import { useSaveNote } from '@/features/notes/useSaveNote';
import { useChatRoom } from '@/features/chat/useChatRoom';
import { ChatScreenShell } from '@/components/chat/ChatScreenShell';
import { Text } from '@/components/ui/Text';
import { PressableScale } from '@/components/motion/PressableScale';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { assistantRoute } from '@/lib/routes';
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
  const saveNote = useSaveNote();
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const selectedPersonalityId = useSettingsStore((s) => s.selectedPersonalityId);
  const personalities = useSettingsStore((s) => s.personalities);
  const assistantSubtitle = getAssistantSubtitle(
    assistantDisplayName,
    selectedPersonalityId,
    personalities
  );

  const {
    title,
    kind,
    isVoice,
    displayMessages,
    visibleText,
    streamTurnKey,
    isStreaming,
    isGenerating,
    isImageGenerating,
    streamStatusMessage,
    streamRevision,
    send,
    stopGeneration,
    savedMessageIds,
    setTitle,
  } = useChatRoom({
    sessionId: id,
    initialTitle: titleParam,
    initialKind: kindParam,
  });

  const voiceBanner =
    isVoice && id ? (
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
          onPress={() => router.push(assistantRoute({ resumeSessionId: id }))}>
          <View style={[styles.resumeBtn, { backgroundColor: colors.primary }]}>
            <Text variant="caption" style={{ color: colors.onPrimary }}>
              Resume voice
            </Text>
          </View>
        </PressableScale>
      </View>
    ) : null;

  return (
    <ChatScreenShell
      key={id}
      title={title}
      subtitle={
        isVoice ? `${assistantSubtitle} · Voice chat` : assistantSubtitle
      }
      sessionId={id}
      sessionKind={kind}
      onSessionRenamed={setTitle}
      banner={voiceBanner}
      messages={displayMessages}
      visibleText={visibleText}
      streamTurnKey={streamTurnKey}
      isStreaming={isStreaming}
      isGenerating={isGenerating}
      isImageGenerating={isImageGenerating}
      streamStatusMessage={streamStatusMessage}
      streamRevision={streamRevision}
      savedMessageIds={savedMessageIds}
      assistantLabel={assistantDisplayName}
      onSaveNote={saveNote}
      onSend={send}
      onStop={stopGeneration}
    />
  );
}

const styles = StyleSheet.create({
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
