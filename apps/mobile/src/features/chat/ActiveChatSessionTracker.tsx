import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { useComposeDraftStore } from './chatSessionLifecycle';
import { resolveActiveChatSessionId } from './chatRoutes';
import { useActiveChatSessionStore } from './activeChatSessionStore';
import { useVoiceSessionBridge } from '@/features/voice-assistant/voiceSessionBridge';

export function ActiveChatSessionTracker() {
  const pathname = usePathname();
  const composeLiveSessionId = useComposeDraftStore((s) => s.liveSessionId);
  const voiceActive = useVoiceSessionBridge((s) => s.isActive);
  const voiceSessionId = useVoiceSessionBridge((s) => s.chatSessionId);
  const setActiveSessionId = useActiveChatSessionStore((s) => s.setActiveSessionId);

  useEffect(() => {
    let sessionId =
      resolveActiveChatSessionId(pathname, composeLiveSessionId) ?? null;
    if (
      !sessionId &&
      pathname.includes('/assistant') &&
      voiceActive &&
      voiceSessionId
    ) {
      sessionId = voiceSessionId;
    }
    setActiveSessionId(sessionId);
  }, [
    pathname,
    composeLiveSessionId,
    voiceActive,
    voiceSessionId,
    setActiveSessionId,
  ]);

  useEffect(() => () => setActiveSessionId(null), [setActiveSessionId]);

  return null;
}
