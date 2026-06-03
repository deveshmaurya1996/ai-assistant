import type { Href } from 'expo-router';
import { PENDING_CHAT_STREAM_KEY } from '@/features/chat/chatStreamStore';
import {
  assistantRoute,
  chatSessionRoute,
  Routes,
} from '@/lib/routes';
import type { OverlayActivityKind } from './buildOverlayActivities';

export type OverlayForegroundScreen = 'chat' | 'voice' | 'other';

export type OverlayNavigationTarget = {
  kind: OverlayActivityKind;
  sessionKey: string;
};

export function overlayActivityToHref(
  target: OverlayNavigationTarget
): Href {
  if (target.kind === 'voice') {
    const resumeSessionId =
      target.sessionKey !== '__voice__' ? target.sessionKey : undefined;
    return assistantRoute(
      resumeSessionId ? { resumeSessionId } : undefined
    );
  }

  if (target.sessionKey === PENDING_CHAT_STREAM_KEY) {
    return Routes.chatCompose;
  }

  return chatSessionRoute(target.sessionKey);
}

export function parseOverlayDeepLink(url: string): OverlayNavigationTarget | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'overlay' || parsed.pathname !== '/open') {
      return null;
    }
    const kind = parsed.searchParams.get('kind');
    const sessionKey = parsed.searchParams.get('sessionKey');
    if (kind !== 'chat' && kind !== 'voice') return null;
    if (!sessionKey) return null;
    return { kind, sessionKey };
  } catch {
    return null;
  }
}

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
