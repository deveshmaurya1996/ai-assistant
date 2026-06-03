import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { formatApiError } from '@/lib/format-ai-error';
import { useChatRoom } from '@/features/chat/useChatRoom';
import { useSaveNote } from '@/features/notes/useSaveNote';
import { type ChatSendPayload } from '@/components/chat/ChatComposer';
import { ChatScreenShell } from '@/components/chat/ChatScreenShell';
import {
  getAssistantSubtitle,
  useSettingsStore,
} from '@/stores/settings';

export default function ChatComposeScreen() {
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
    kind,
    displayMessages,
    visibleText,
    streamTurnKey,
    isStreaming,
    isGenerating,
    streamStatusMessage,
    send: roomSend,
    stopGeneration,
    savedMessageIds,
    setTitle,
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
    <ChatScreenShell
      title={title}
      subtitle={assistantSubtitle}
      sessionId={liveSessionId}
      sessionKind={kind}
      onSessionRenamed={setTitle}
      messages={displayMessages}
      visibleText={visibleText}
      streamTurnKey={streamTurnKey}
      isStreaming={isStreaming}
      isGenerating={isGenerating}
      streamStatusMessage={streamStatusMessage}
      emptyHint="Send a message to start"
      savedMessageIds={savedMessageIds}
      assistantLabel={assistantDisplayName}
      onSaveNote={saveNote}
      onSend={send}
      onStop={stopGeneration}
    />
  );
}
