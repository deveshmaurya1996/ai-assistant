import { View, StyleSheet } from 'react-native';
import type { ChatMessage } from '@ai-assistant/sdk';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/tokens';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
import { useSaveNote } from '@/features/notes/useSaveNote';
import { useSettingsStore } from '@/stores/settings';
import type { VoiceAssistantPhase } from '@/features/voice-assistant/useVoiceAssistantSession';

type Props = {
  messages: ChatMessage[];
  visibleText: string;
  streamTurnKey?: number;
  isStreaming: boolean;
  isGenerating?: boolean;
  phase: VoiceAssistantPhase;
  contentPaddingBottom?: number;
};

function emptyHintForPhase(phase: VoiceAssistantPhase): string {
  switch (phase) {
    case 'listening':
      return 'Listening… speak when ready';
    case 'transcribing':
      return 'Processing your speech…';
    case 'waiting_for_ai':
      return 'Thinking…';
    case 'speaking':
      return 'Speaking…';
    default:
      return 'Your conversation will appear here';
  }
}

export function VoiceConversationView({
  messages,
  visibleText,
  streamTurnKey = 0,
  isStreaming,
  isGenerating = false,
  phase,
  contentPaddingBottom,
}: Props) {
  const saveNote = useSaveNote();
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const emptyHint = emptyHintForPhase(phase);

  if (messages.length === 0) {
    return (
      <View style={[styles.empty, contentPaddingBottom ? { paddingBottom: contentPaddingBottom } : null]}>
        <Text variant="body" muted style={styles.emptyText}>
          {emptyHint}
        </Text>
      </View>
    );
  }

  return (
    <ChatMessageList
      messages={messages}
      visibleText={visibleText}
      streamTurnKey={streamTurnKey}
      isStreaming={isStreaming}
      isGenerating={isGenerating}
      contentPaddingBottom={contentPaddingBottom}
      assistantLabel={assistantDisplayName}
      onSaveNote={saveNote}
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
  },
});
