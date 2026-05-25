import { View, StyleSheet } from 'react-native';
import type { ChatMessage } from '@ai-assistant/sdk';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/tokens';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
import type { VoiceAssistantPhase } from '@/features/voice-assistant/useVoiceAssistantSession';

type Props = {
  messages: ChatMessage[];
  visibleText: string;
  isStreaming: boolean;
  isGenerating?: boolean;
  phase: VoiceAssistantPhase;
};

export function VoiceConversationView({
  messages,
  visibleText,
  isStreaming,
  isGenerating = false,
  phase,
}: Props) {
  if (messages.length === 0) {
    return (
      <View style={styles.empty}>
        <Text variant="body" muted style={{ textAlign: 'center' }}>
          {phase === 'listening'
            ? 'Listening… speak when ready'
            : phase === 'transcribing'
              ? 'Processing your speech…'
              : phase === 'waiting_for_ai'
                ? 'Thinking…'
                : 'Your conversation will appear here'}
        </Text>
      </View>
    );
  }

  return (
    <ChatMessageList
      messages={messages}
      visibleText={visibleText}
      isStreaming={isStreaming}
      isGenerating={isGenerating}
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
});
