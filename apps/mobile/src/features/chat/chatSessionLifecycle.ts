import type { ChatSessionKind } from '@ai-assistant/sdk';
import { useComposeDraftStore } from './composeDraftStore';
import { useChatSidebarStore } from './chatSidebarStore';
import { PENDING_CHAT_STREAM_KEY, useChatStreamStore } from './chatStreamStore';

export { useComposeDraftStore } from './composeDraftStore';

export function promoteDraftSession(sessionId: string, kind: ChatSessionKind = 'text') {
  useComposeDraftStore.getState().setLiveSessionId(sessionId);
  useComposeDraftStore.getState().setPromotingInPlace(true);
  useChatSidebarStore.getState().upsertSession({
    id: sessionId,
    title: 'New chat',
    kind,
    messageCount: 1,
  });
}

export function prepareNewCompose() {
  resetDraftChat();
}

export function resetDraftChat() {
  const { liveSessionId } = useComposeDraftStore.getState();
  const stream = useChatStreamStore.getState();

  if (liveSessionId) {
    stream.clearTurn(liveSessionId);
  }
  stream.clearTurn(PENDING_CHAT_STREAM_KEY);
  stream.setBoundTurnSessionId(null);

  useComposeDraftStore.getState().setLiveSessionId(null);
  useComposeDraftStore.getState().setPromotingInPlace(false);
}

export function finishInPlacePromotion() {
  useComposeDraftStore.getState().setPromotingInPlace(false);
}

export function getComposeActiveSessionId(): string | undefined {
  return useComposeDraftStore.getState().liveSessionId ?? undefined;
}
