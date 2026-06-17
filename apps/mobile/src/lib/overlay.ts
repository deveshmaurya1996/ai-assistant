import { Platform, Linking } from 'react-native';
import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import type { OverlayActivity } from '@/features/overlay/buildOverlayActivities';
import {
  shouldShowOverlay,
} from '@/features/overlay/buildOverlayActivities';
import type { OverlayForegroundScreen } from '@/features/overlay/resolveOverlayRoute';

export type OverlayBubbleState = 'idle' | 'listening' | 'processing' | 'speaking';

export type OverlaySizeTier = 'compact' | 'medium';

export type VoiceOverlaySyncInput = {
  phase: string;
  assistantText?: string;
  appState: string;
  sessionActive: boolean;
  assistantDisplayName?: string;
};

export type AssistantOverlaySyncInput = {
  appState: string;
  overlayEnabled: boolean;
  voiceOverlayEnabled: boolean;
  userDismissed: boolean;
  activeItem: OverlayActivity | null;
  rotationHint?: string;
  foregroundScreen: OverlayForegroundScreen;
  currentChatSessionKey: string | null;
};

export type OverlayNavigationTarget = {
  kind: 'chat' | 'voice';
  sessionKey: string;
};

type OverlayModule = {
  showBubble?: () => Promise<void>;
  hideBubble?: () => Promise<void>;
  setBubbleState?: (state: OverlayBubbleState) => Promise<void>;
  setOverlayAssistantName?: (name: string) => Promise<void>;
  setOverlayContextLabel?: (label: string) => Promise<void>;
  setOverlayExpanded?: (expanded: boolean) => Promise<void>;
  showOverlay?: (text: string) => Promise<void>;
  hideOverlay?: () => Promise<void>;
  updateOverlayText?: (text: string) => Promise<void>;
  canDrawOverlays?: () => Promise<boolean>;
  requestOverlayPermission?: () => Promise<void>;
  startVoiceService?: () => Promise<void>;
  stopVoiceService?: () => Promise<void>;
  setOverlayNavigationTarget?: (kind: string, sessionKey: string) => Promise<void>;
  setReminderOverlayEnabled?: (enabled: boolean) => Promise<void>;
  showReminderOverlay?: (displayTitle: string, userPrompt: string) => Promise<void>;
  isReminderOverlayPinned?: () => Promise<boolean>;
  addListener?: (
    eventName: string,
    listener: (payload: Record<string, string>) => void
  ) => EventSubscription;
};

function getOverlayModule(): OverlayModule | undefined {
  if (Platform.OS !== 'android') return undefined;
  try {
    return requireNativeModule<OverlayModule>('AssistantOverlay');
  } catch {
    return undefined;
  }
}

const NativeOverlay = getOverlayModule();

export async function canDrawOverlays(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (NativeOverlay?.canDrawOverlays) {
    return NativeOverlay.canDrawOverlays();
  }
  return false;
}

export async function requestOverlayPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (NativeOverlay?.requestOverlayPermission) {
    await NativeOverlay.requestOverlayPermission();
    return;
  }
  await Linking.openSettings();
}

export async function showOverlayPanel(text: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  const can = await canDrawOverlays();
  if (!can) {
    await requestOverlayPermission();
    return;
  }
  if (NativeOverlay?.showOverlay) {
    await NativeOverlay.showOverlay(text);
    return;
  }
  if (NativeOverlay?.showBubble) {
    await NativeOverlay.showBubble();
  }
}

export async function isReminderOverlayPinned(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeOverlay?.isReminderOverlayPinned) {
    return false;
  }
  return NativeOverlay.isReminderOverlayPinned();
}

export async function hideOverlayPanel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (await isReminderOverlayPinned()) return;
  if (NativeOverlay?.hideOverlay) {
    await NativeOverlay.hideOverlay();
    return;
  }
  if (NativeOverlay?.hideBubble) {
    await NativeOverlay.hideBubble();
  }
}

export async function updateOverlayPanelText(text: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (NativeOverlay?.updateOverlayText) {
    await NativeOverlay.updateOverlayText(text);
  }
}

export async function setOverlayAssistantName(name: string): Promise<void> {
  if (Platform.OS !== 'android' || !NativeOverlay?.setOverlayAssistantName) return;
  await NativeOverlay.setOverlayAssistantName(name);
}

export async function setOverlayContextLabel(label: string): Promise<void> {
  if (Platform.OS !== 'android' || !NativeOverlay?.setOverlayContextLabel) return;
  await NativeOverlay.setOverlayContextLabel(label);
}

export async function startVoiceAssistantService(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const can = await canDrawOverlays();
  if (!can) {
    await requestOverlayPermission();
  }
  if (NativeOverlay?.startVoiceService) {
    await NativeOverlay.startVoiceService();
  }
}

export async function stopVoiceAssistantService(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (NativeOverlay?.stopVoiceService) {
    await NativeOverlay.stopVoiceService();
  }
  await hideOverlayPanel();
}

export async function showOverlayBubble(): Promise<void> {
  await showOverlayPanel('');
}

export async function hideOverlayBubble(): Promise<void> {
  await hideOverlayPanel();
}

export async function setBubbleState(state: OverlayBubbleState): Promise<void> {
  if (Platform.OS !== 'android' || !NativeOverlay?.setBubbleState) return;
  await NativeOverlay.setBubbleState(state);
}

export async function setOverlaySizeTier(tier: OverlaySizeTier): Promise<void> {
  if (Platform.OS !== 'android' || !NativeOverlay?.setOverlayExpanded) return;
  await NativeOverlay.setOverlayExpanded(tier === 'medium');
}

export async function setOverlayExpanded(expanded: boolean): Promise<void> {
  await setOverlaySizeTier(expanded ? 'medium' : 'compact');
}

export async function setOverlayNavigationTarget(
  target: OverlayNavigationTarget | null
): Promise<void> {
  if (Platform.OS !== 'android' || !NativeOverlay?.setOverlayNavigationTarget) return;
  if (!target) {
    await NativeOverlay.setOverlayNavigationTarget('', '');
    return;
  }
  await NativeOverlay.setOverlayNavigationTarget(target.kind, target.sessionKey);
}

export async function syncAssistantOverlay(input: AssistantOverlaySyncInput): Promise<void> {
  if (Platform.OS !== 'android') return;

  const {
    appState,
    overlayEnabled,
    voiceOverlayEnabled,
    userDismissed,
    activeItem,
    rotationHint,
    foregroundScreen,
    currentChatSessionKey,
  } = input;

  const pinned = await isReminderOverlayPinned();

  if (
    !shouldShowOverlay({
      appState,
      overlayEnabled,
      voiceOverlayEnabled,
      userDismissed,
      activeItem,
      foregroundScreen,
      currentChatSessionKey,
    })
  ) {
    if (pinned) return;
    await setOverlayNavigationTarget(null);
    await hideOverlayPanel();
    await setBubbleState('idle');
    return;
  }

  const can = await canDrawOverlays();
  if (!can) return;

  if (!activeItem) {
    if (pinned) return;
    await setOverlayNavigationTarget(null);
    await hideOverlayPanel();
    return;
  }

  if (pinned) return;

  const navigationTarget: OverlayNavigationTarget =
    activeItem.kind === 'voice' || (foregroundScreen === 'voice' && activeItem.sessionKey)
      ? { kind: 'voice', sessionKey: '__voice__' }
      : { kind: activeItem.kind, sessionKey: activeItem.sessionKey };

  await setOverlayNavigationTarget(navigationTarget);

  const contextWithRotation = rotationHint
    ? `${activeItem.contextLabel} · ${rotationHint}`
    : activeItem.contextLabel;

  await setOverlayAssistantName(activeItem.assistantName);
  await setOverlayContextLabel(contextWithRotation);
  await showOverlayPanel(activeItem.text);
  await setBubbleState(activeItem.bubbleState);

  const hasText = activeItem.text.trim().length > 0;
  if (hasText) {
    await updateOverlayPanelText(activeItem.text);
    await setOverlaySizeTier('medium');
  } else {
    await setOverlaySizeTier('compact');
  }
}

export async function syncVoiceOverlay(input: VoiceOverlaySyncInput): Promise<void> {
  const showPhases = new Set([
    'listening',
    'transcribing',
    'waiting_for_ai',
    'speaking',
  ]);
  const sessionActive = input.sessionActive && showPhases.has(input.phase);

  await syncAssistantOverlay({
    appState: input.appState,
    overlayEnabled: false,
    voiceOverlayEnabled: true,
    userDismissed: false,
    foregroundScreen: 'voice',
    currentChatSessionKey: null,
    activeItem: sessionActive
      ? {
          kind: 'voice',
          sessionKey: '__voice__',
          contextLabel: `Voice chat with ${input.assistantDisplayName ?? 'Assistant'}`,
          assistantName: input.assistantDisplayName ?? 'Assistant',
          text: input.assistantText ?? '',
          bubbleState:
            input.phase === 'listening' || input.phase === 'transcribing'
              ? 'listening'
              : input.phase === 'speaking'
                ? 'speaking'
                : 'processing',
          isGenerating: true,
          lastUpdatedAt: Date.now(),
        }
      : null,
  });
}

export function subscribeOverlayDismissed(onDismissed: () => void): () => void {
  if (Platform.OS !== 'android' || !NativeOverlay?.addListener) {
    return () => {};
  }
  const sub = NativeOverlay.addListener('onOverlayDismissed', () => onDismissed());
  return () => sub.remove();
}

export function subscribeOverlayOpened(
  onOpened: (target: OverlayNavigationTarget) => void
): () => void {
  if (Platform.OS !== 'android' || !NativeOverlay?.addListener) {
    return () => {};
  }
  const sub = NativeOverlay.addListener('onOverlayOpened', (payload) => {
    const kind = payload.kind;
    const sessionKey = payload.sessionKey;
    if ((kind !== 'chat' && kind !== 'voice') || !sessionKey) return;
    onOpened({ kind, sessionKey });
  });
  return () => sub.remove();
}

export async function setReminderOverlayEnabledNative(enabled: boolean): Promise<void> {
  if (Platform.OS !== 'android' || !NativeOverlay?.setReminderOverlayEnabled) return;
  await NativeOverlay.setReminderOverlayEnabled(enabled);
}

function formatReminderOverlayText(displayTitle: string, userPrompt: string): string {
  const title = displayTitle.trim() || 'Reminder';
  const prompt = userPrompt.trim();
  if (!prompt || prompt.toLowerCase() === title.toLowerCase()) return title;
  return `${title}\n${prompt}`;
}

export async function showReminderOverlay(
  displayTitle: string,
  userPrompt: string
): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (NativeOverlay?.showReminderOverlay) {
    await NativeOverlay.showReminderOverlay(displayTitle, userPrompt);
    return;
  }
  await showOverlayPanel(formatReminderOverlayText(displayTitle, userPrompt));
}

export async function toggleOverlay(enabled: boolean): Promise<void> {
  if (enabled) {
    const granted = await canDrawOverlays();
    if (!granted) {
      await requestOverlayPermission();
      return;
    }
    await showOverlayBubble();
  } else {
    await hideOverlayBubble();
  }
}

export { NativeOverlay };
