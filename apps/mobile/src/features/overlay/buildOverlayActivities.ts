import type { OverlayBubbleState } from '@/lib/overlay';
import type { VoiceAssistantPhase } from '@/features/voice-assistant/useVoiceAssistantSession';
import {
  PENDING_CHAT_STREAM_KEY,
  type SessionStreamState,
} from '@/features/chat/chatStreamStore';
import { getOverlayContextLabel } from './overlaySessionStore';
import type { OverlayForegroundScreen } from './resolveOverlayRoute';

export type OverlayActivityKind = 'chat' | 'voice';

export type OverlayActivity = {
  kind: OverlayActivityKind;
  sessionKey: string;
  contextLabel: string;
  assistantName: string;
  text: string;
  bubbleState: OverlayBubbleState;
  isGenerating: boolean;
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
};

function buildChatActivities({
  sessions,
  assistantName,
  excludeSessionKeys,
}: BuildChatActivitiesInput): OverlayActivity[] {
  const items: OverlayActivity[] = [];

  for (const [sessionKey, stream] of Object.entries(sessions)) {
    if (sessionKey === PENDING_CHAT_STREAM_KEY && !stream.isGenerating) continue;
    if (excludeSessionKeys?.has(sessionKey)) continue;

    if (!stream.isGenerating) continue;

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
  }

  return items;
}

type BuildVoiceActivityInput = {
  phase: VoiceAssistantPhase;
  voiceSessionId: string | null | undefined;
  assistantText: string;
  assistantName: string;
  voiceTitle?: string;
};

function buildVoiceActivity({
  phase,
  voiceSessionId,
  assistantText,
  assistantName,
  voiceTitle,
}: BuildVoiceActivityInput): OverlayActivity | null {
  if (!VOICE_ACTIVE_PHASES.has(phase)) return null;

  const sessionKey = voiceSessionId ?? '__voice__';
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

export type BuildOverlayActivitiesInput = {
  chatSessions: Record<string, SessionStreamState>;
  assistantName: string;
  voicePhase: VoiceAssistantPhase;
  voiceSessionId?: string | null;
  voiceAssistantText?: string;
  voiceTitle?: string;
};

export function buildOverlayActivities(
  input: BuildOverlayActivitiesInput
): OverlayActivity[] {
  const voice = buildVoiceActivity({
    phase: input.voicePhase,
    voiceSessionId: input.voiceSessionId,
    assistantText: input.voiceAssistantText ?? '',
    assistantName: input.assistantName,
    voiceTitle: input.voiceTitle,
  });

  const excludeKeys = voice?.sessionKey ? new Set([voice.sessionKey]) : undefined;

  const chatItems = buildChatActivities({
    sessions: input.chatSessions,
    assistantName: input.assistantName,
    excludeSessionKeys: excludeKeys,
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
    if (inBackground) return activeItem.isGenerating;
    return overlayEnabled && activeItem.isGenerating;
  }

  if (activeItem.kind === 'voice') {
    if (inBackground) return true;
    if (foregroundScreen === 'voice') return voiceOverlayEnabled;
    return overlayEnabled;
  }

  return false;
}
