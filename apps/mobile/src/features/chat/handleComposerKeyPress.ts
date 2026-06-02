import { Platform, type TextInputKeyPressEvent } from 'react-native';

type ComposerKeyNativeEvent = TextInputKeyPressEvent['nativeEvent'] & {
  shiftKey?: boolean;
  preventDefault?: () => void;
};

function canUseEnterToSend(nativeEvent: ComposerKeyNativeEvent): boolean {
  if (Platform.OS === 'web') return true;
  return 'shiftKey' in nativeEvent;
}

export function handleComposerKeyPress(
  e: TextInputKeyPressEvent,
  onSend: () => void,
  canSend: boolean,
): void {
  if (!canSend || e.nativeEvent.key !== 'Enter') return;

  const native = e.nativeEvent as ComposerKeyNativeEvent;
  if (native.shiftKey) return;
  if (!canUseEnterToSend(native)) return;

  native.preventDefault?.();
  onSend();
}
