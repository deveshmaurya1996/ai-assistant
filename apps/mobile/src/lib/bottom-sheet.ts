import type { ForwardedRef } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

export function dismissBottomSheet(ref: ForwardedRef<BottomSheetModal>) {
  if (typeof ref === 'function') return;
  ref?.current?.dismiss();
}
