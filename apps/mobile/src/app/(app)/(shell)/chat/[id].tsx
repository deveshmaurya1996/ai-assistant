import { useState } from 'react';
import { Keyboard } from 'react-native';
import { ChatScreenShell } from '@/components/chat/ChatScreenShell';
import { VoiceSessionFooter } from '@/components/assistant/VoiceSessionFooter';
import { useSaveNote } from '@/features/notes/useSaveNote';
import { useChatRoom } from '@/features/chat/useChatRoom';
import {
  getAssistantSubtitle,
  useSettingsStore,
} from '@/stores/settings';
import { useLocalSearchParams } from 'expo-router';

export default function ChatScreen() {
  const { id, title: titleParam, kind: kindParam } = useLocalSearchParams<{
    id: string;
    title?: string;
    kind?: string;
  }>();
  const saveNote = useSaveNote();
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const selectedPersonalityId = useSettingsStore((s) => s.selectedPersonalityId);
  const personalities = useSettingsStore((s) => s.personalities);
  const assistantSubtitle = getAssistantSubtitle(
    assistantDisplayName,
    selectedPersonalityId,
    personalities
  );
  const [composerOpen, setComposerOpen] = useState(false);

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

  const voiceFooter =
    isVoice && id ? (
      <VoiceSessionFooter
        sessionId={id}
        composerOpen={composerOpen}
        onToggleComposer={() => {
          setComposerOpen((open) => {
            if (open) Keyboard.dismiss();
            return !open;
          });
        }}
      />
    ) : null;

  return (
    <ChatScreenShell
      key={id}
      title={title}
      subtitle={assistantSubtitle}
      sessionId={id}
      sessionKind={kind}
      onSessionRenamed={setTitle}
      footer={voiceFooter}
      composerVisible={!isVoice || composerOpen}
      composerProps={isVoice ? { hideAssistantButton: true } : undefined}
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
