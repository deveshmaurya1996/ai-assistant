import { PENDING_CHAT_STREAM_KEY } from '@/features/chat/chatStreamStore';

export type OverlayForegroundScreen = 'chat' | 'voice' | 'other';

export function resolveOverlayForegroundScreen(
  segments: readonly string[]
): OverlayForegroundScreen {
  if (segments.includes('chat')) return 'chat';
  if (segments.includes('assistant')) return 'voice';
  return 'other';
}

export function resolveCurrentChatSessionKey(
  segments: readonly string[]
): string | null {
  const chatIdx = segments.indexOf('chat');
  if (chatIdx === -1) return null;
  const routeSegment = segments[chatIdx + 1];
  if (!routeSegment || routeSegment === 'compose') {
    return PENDING_CHAT_STREAM_KEY;
  }
  return routeSegment;
}
