import { getActiveChatSessionId } from './activeChatSessionStore';
import { useChatSidebarStore } from './chatSidebarStore';

export function syncSidebarAttention(sessionId: string): void {
  if (!sessionId) return;
  const patchUnread = useChatSidebarStore.getState().patchUnread;
  if (getActiveChatSessionId() === sessionId) {
    patchUnread(sessionId, false);
    return;
  }
  patchUnread(sessionId, true);
}

export function clearSidebarAttention(sessionId: string): void {
  useChatSidebarStore.getState().patchUnread(sessionId, false);
}

export function shouldShowSidebarAttentionDot(
  hasUnread: boolean | undefined,
  isGenerating: boolean,
  isActive: boolean
): boolean {
  if (isActive) return false;
  return Boolean(hasUnread || isGenerating);
}
