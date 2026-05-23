import { NativeModules, Platform, Linking } from 'react-native';

type OverlayModule = {
  showBubble?: () => Promise<void>;
  hideBubble?: () => Promise<void>;
  setBubbleState?: (state: 'idle' | 'listening' | 'processing') => Promise<void>;
  canDrawOverlays?: () => Promise<boolean>;
  requestOverlayPermission?: () => Promise<void>;
};

const NativeOverlay: OverlayModule | undefined =
  NativeModules.AssistantOverlay ?? NativeModules.OverlayModule;

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

export async function showOverlayBubble(): Promise<void> {
  if (Platform.OS !== 'android' || !NativeOverlay?.showBubble) {
    console.warn('Overlay requires Android dev build with native module');
    return;
  }
  const can = await canDrawOverlays();
  if (!can) {
    await requestOverlayPermission();
    return;
  }
  await NativeOverlay.showBubble();
}

export async function hideOverlayBubble(): Promise<void> {
  if (Platform.OS !== 'android' || !NativeOverlay?.hideBubble) return;
  await NativeOverlay.hideBubble();
}

export async function setBubbleState(
  state: 'idle' | 'listening' | 'processing'
): Promise<void> {
  if (Platform.OS !== 'android' || !NativeOverlay?.setBubbleState) return;
  await NativeOverlay.setBubbleState(state);
}

export async function toggleOverlay(enabled: boolean): Promise<void> {
  if (enabled) {
    await showOverlayBubble();
  } else {
    await hideOverlayBubble();
  }
}

export { NativeOverlay };
