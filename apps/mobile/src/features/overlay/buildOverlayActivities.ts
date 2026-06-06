import type { OverlayBubbleState } from '@/lib/overlay';
import type { VoiceAssistantPhase } from '@/features/voice-assistant/useVoiceAssistantSession';
import {
  PENDING_CHAT_STREAM_KEY,
  type SessionStreamState,
} from '@/features/chat/chatStreamStore';
import { getOverlayContextLabel } from './overlaySessionStore';
import type { OverlayForegroundScreen } from './resolveOverlayRoute';

export type OverlayActivityKind = 'chat' | 'voice';

export type OverlayLastReply = {
  text: string;
  updatedAt: number;
};

export type OverlayActivity = {
  kind: OverlayActivityKind;
  sessionKey: string;
  contextLabel: string;
  assistantName: string;
  text: string;
  bubbleState: OverlayBubbleState;
  isGenerating: boolean;
  persisted?: boolean;
  lastUpdatedAt: number;
};

const VOICE_ACTIVE_PHASES = new Set<VoiceAssistantPhase>([
  'listening',
  'transcribing',
  'waiting_for_ai',
  'speaking',
]);

function phaseToBubbleState(phase: VoiceAssistantPhase): OverlayBubbleState {
  switch (phase) {
    case 'listening':
    case 'transcribing':
      return 'listening';
    case 'waiting_for_ai':
      return 'processing';
    case 'speaking':
      return 'speaking';
    default:
      return 'idle';
  }
}

type BuildChatActivitiesInput = {
  sessions: Record<string, SessionStreamState>;
  assistantName: string;
  excludeSessionKeys?: Set<string>;
  inBackground?: boolean;
  lastReplies?: Record<string, OverlayLastReply>;
};

function buildChatActivities({
  sessions,
  assistantName,
  excludeSessionKeys,
  inBackground,
  lastReplies,
}: BuildChatActivitiesInput): OverlayActivity[] {
  const items: OverlayActivity[] = [];

  for (const [sessionKey, stream] of Object.entries(sessions)) {
    if (sessionKey === PENDING_CHAT_STREAM_KEY && !stream.isGenerating) continue;
    if (excludeSessionKeys?.has(sessionKey)) continue;

    if (stream.isGenerating) {
      const contextLabel =
        sessionKey === PENDING_CHAT_STREAM_KEY
          ? 'New chat'
          : getOverlayContextLabel(sessionKey);

      items.push({
        kind: 'chat',
        sessionKey,
        contextLabel,
        assistantName,
        text: stream.streamText,
        bubbleState: 'processing',
        isGenerating: true,
        lastUpdatedAt: stream.revision,
      });
      continue;
    }

    if (!inBackground || !lastReplies) continue;
    const persisted = lastReplies[sessionKey];
    if (!persisted?.text.trim()) continue;

    items.push({
      kind: 'chat',
      sessionKey,
      contextLabel: getOverlayContextLabel(sessionKey),
      assistantName,
      text: persisted.text,
      bubbleState: 'idle',
      isGenerating: false,
      persisted: true,
      lastUpdatedAt: persisted.updatedAt,
    });
  }

  if (inBackground && lastReplies) {
    for (const [sessionKey, persisted] of Object.entries(lastReplies)) {
      if (excludeSessionKeys?.has(sessionKey)) continue;
      if (sessions[sessionKey]?.isGenerating) continue;
      if (!persisted.text.trim()) continue;
      if (items.some((item) => item.sessionKey === sessionKey)) continue;

      items.push({
        kind: 'chat',
        sessionKey,
        contextLabel: getOverlayContextLabel(sessionKey),
        assistantName,
        text: persisted.text,
        bubbleState: 'idle',
        isGenerating: false,
        persisted: true,
        lastUpdatedAt: persisted.updatedAt,
      });
    }
  }

  return items;
}

type BuildVoiceActivityInput = {
  phase: VoiceAssistantPhase;
  voiceSessionId: string | null | undefined;
  assistantText: string;
  assistantName: string;
  voiceTitle?: string;
  inBackground?: boolean;
  lastReplies?: Record<string, OverlayLastReply>;
};

function buildVoiceActivity({
  phase,
  voiceSessionId,
  assistantText,
  assistantName,
  voiceTitle,
  inBackground,
  lastReplies,
}: BuildVoiceActivityInput): OverlayActivity | null {
  const sessionKey = voiceSessionId ?? '__voice__';

  if (VOICE_ACTIVE_PHASES.has(phase)) {
    const contextLabel = voiceTitle ?? `Voice chat with ${assistantName}`;

    return {
      kind: 'voice',
      sessionKey,
      contextLabel,
      assistantName,
      text: assistantText,
      bubbleState: phaseToBubbleState(phase),
      isGenerating: phase === 'waiting_for_ai' || phase === 'speaking',
      lastUpdatedAt: Date.now(),
    };
  }

  if (!inBackground || !lastReplies) return null;
  const persisted = lastReplies[sessionKey];
  if (!persisted?.text.trim()) return null;

  return {
    kind: 'voice',
    sessionKey,
    contextLabel: voiceTitle ?? `Voice chat with ${assistantName}`,
    assistantName,
    text: persisted.text,
    bubbleState: 'idle',
    isGenerating: false,
    persisted: true,
    lastUpdatedAt: persisted.updatedAt,
  };
}

export type BuildOverlayActivitiesInput = {
  chatSessions: Record<string, SessionStreamState>;
  assistantName: string;
  voicePhase: VoiceAssistantPhase;
  voiceSessionId?: string | null;
  voiceAssistantText?: string;
  voiceTitle?: string;
  appState?: string;
  lastReplies?: Record<string, OverlayLastReply>;
};

export function buildOverlayActivities(
  input: BuildOverlayActivitiesInput
): OverlayActivity[] {
  const inBackground = input.appState !== 'active' && input.appState !== undefined;

  const voice = buildVoiceActivity({
    phase: input.voicePhase,
    voiceSessionId: input.voiceSessionId,
    assistantText: input.voiceAssistantText ?? '',
    assistantName: input.assistantName,
    voiceTitle: input.voiceTitle,
    inBackground,
    lastReplies: input.lastReplies,
  });

  const excludeKeys = voice?.sessionKey ? new Set([voice.sessionKey]) : undefined;

  const chatItems = buildChatActivities({
    sessions: input.chatSessions,
    assistantName: input.assistantName,
    excludeSessionKeys: excludeKeys,
    inBackground,
    lastReplies: input.lastReplies,
  });

  const items = voice ? [voice, ...chatItems] : chatItems;

  return items.sort((a, b) => {
    if (a.isGenerating !== b.isGenerating) {
      return a.isGenerating ? -1 : 1;
    }
    return b.lastUpdatedAt - a.lastUpdatedAt;
  });
}

export type ShouldShowOverlayInput = {
  appState: string;
  overlayEnabled: boolean;
  voiceOverlayEnabled: boolean;
  userDismissed: boolean;
  activeItem: OverlayActivity | null;
  foregroundScreen: OverlayForegroundScreen;
  currentChatSessionKey: string | null;
};

export function shouldShowOverlay({
  appState,
  overlayEnabled,
  voiceOverlayEnabled,
  userDismissed,
  activeItem,
  foregroundScreen,
}: ShouldShowOverlayInput): boolean {
  if (!activeItem || userDismissed) return false;

  const inBackground = appState !== 'active';

  if (activeItem.kind === 'chat') {
    if (!inBackground && foregroundScreen === 'chat') return false;
    if (inBackground) return activeItem.isGenerating || activeItem.persisted === true;
    return overlayEnabled && activeItem.isGenerating;
  }

  if (activeItem.kind === 'voice') {
    if (inBackground) return activeItem.isGenerating || activeItem.persisted === true;
    if (foregroundScreen === 'voice') return voiceOverlayEnabled;
    return overlayEnabled;
  }

  return false;
}
