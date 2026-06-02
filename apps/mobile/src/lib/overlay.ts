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
  userDismissed: boolean;
  activeItem: OverlayActivity | null;
  rotationHint?: string;
  foregroundScreen: OverlayForegroundScreen;
  currentChatSessionKey: string | null;
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
  addListener?: (
    eventName: string,
    listener: () => void
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

export async function hideOverlayPanel(): Promise<void> {
  if (Platform.OS !== 'android') return;
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

export async function syncAssistantOverlay(input: AssistantOverlaySyncInput): Promise<void> {
  if (Platform.OS !== 'android') return;

  const {
    appState,
    overlayEnabled,
    userDismissed,
    activeItem,
    rotationHint,
    foregroundScreen,
    currentChatSessionKey,
  } = input;

  if (
    !shouldShowOverlay({
      appState,
      overlayEnabled,
      userDismissed,
      activeItem,
      foregroundScreen,
      currentChatSessionKey,
    })
  ) {
    await hideOverlayPanel();
    await setBubbleState('idle');
    return;
  }

  const can = await canDrawOverlays();
  if (!can) return;

  if (!activeItem) {
    await hideOverlayPanel();
    return;
  }

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
  const sub = NativeOverlay.addListener('onOverlayDismissed', onDismissed);
  return () => sub.remove();
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
