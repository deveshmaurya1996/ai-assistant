import { Platform, Linking } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

export type OverlayBubbleState = 'idle' | 'listening' | 'processing' | 'speaking';

export type OverlaySizeTier = 'compact' | 'medium';

export type VoiceOverlaySyncInput = {
  phase: string;
  assistantText?: string;
  appState: string;
  sessionActive: boolean;
  assistantDisplayName?: string;
};

type OverlayModule = {
  showBubble?: () => Promise<void>;
  hideBubble?: () => Promise<void>;
  setBubbleState?: (state: OverlayBubbleState) => Promise<void>;
  setOverlayAssistantName?: (name: string) => Promise<void>;
  setOverlayExpanded?: (expanded: boolean) => Promise<void>;
  showOverlay?: (text: string) => Promise<void>;
  hideOverlay?: () => Promise<void>;
  updateOverlayText?: (text: string) => Promise<void>;
  canDrawOverlays?: () => Promise<boolean>;
  requestOverlayPermission?: () => Promise<void>;
  startVoiceService?: () => Promise<void>;
  stopVoiceService?: () => Promise<void>;
};

function phaseToBubbleState(phase: string): OverlayBubbleState {
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

/** @deprecated Use setOverlaySizeTier */
export async function setOverlayExpanded(expanded: boolean): Promise<void> {
  await setOverlaySizeTier(expanded ? 'medium' : 'compact');
}

export async function syncVoiceOverlay(input: VoiceOverlaySyncInput): Promise<void> {
  if (Platform.OS !== 'android') return;

  const {
    phase,
    assistantText = '',
    appState,
    sessionActive,
    assistantDisplayName = 'Assistant',
  } = input;
  const inBackground = appState !== 'active';

  if (!sessionActive || !inBackground) {
    await hideOverlayPanel();
    await setBubbleState('idle');
    return;
  }

  const can = await canDrawOverlays();
  if (!can) return;

  const bubble = phaseToBubbleState(phase);
  const showPhases = new Set([
    'listening',
    'transcribing',
    'waiting_for_ai',
    'speaking',
  ]);

  if (!showPhases.has(phase)) {
    await hideOverlayPanel();
    return;
  }

  await setOverlayAssistantName(assistantDisplayName);
  await showOverlayPanel(assistantText);
  await setBubbleState(bubble);

  const hasText = assistantText.trim().length > 0;
  if (hasText) {
    await updateOverlayPanelText(assistantText);
    await setOverlaySizeTier('medium');
  } else {
    await setOverlaySizeTier('compact');
  }
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
