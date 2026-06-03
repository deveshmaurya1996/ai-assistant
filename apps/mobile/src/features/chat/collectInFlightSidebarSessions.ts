import { useComposeDraftStore } from './composeDraftStore';
import { PENDING_CHAT_STREAM_KEY, useChatStreamStore } from './chatStreamStore';

export function collectInFlightSidebarSessions(): string[] {
  const ids = new Set<string>();
  const { liveSessionId } = useComposeDraftStore.getState();
  if (liveSessionId) ids.add(liveSessionId);

  const { sessions, boundTurnSessionId } = useChatStreamStore.getState();
  if (boundTurnSessionId) ids.add(boundTurnSessionId);

  for (const [key, stream] of Object.entries(sessions)) {
    if (key === PENDING_CHAT_STREAM_KEY) continue;
    if (stream.isGenerating) ids.add(key);
  }

  return [...ids];
}
