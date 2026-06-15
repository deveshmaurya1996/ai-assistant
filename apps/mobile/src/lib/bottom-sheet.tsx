import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ForwardedRef,
} from 'react';
import { BackHandler, Platform } from 'react-native';
import {
  BottomSheetModal,
  type BottomSheetModal as BottomSheetModalType,
  type BottomSheetModalProps,
} from '@gorhom/bottom-sheet';

export type { BottomSheetModalType };

export function dismissBottomSheet(ref: ForwardedRef<BottomSheetModalType>) {
  if (typeof ref === 'function') return;
  ref?.current?.dismiss();
}

function useBottomSheetBackHandler(
  ref: ForwardedRef<BottomSheetModalType>,
  onChange?: BottomSheetModalProps['onChange']
): BottomSheetModalProps['onChange'] {
  const subscriptionRef = useRef<ReturnType<typeof BackHandler.addEventListener> | null>(null);

  useEffect(() => {
    return () => {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, []);

  return useCallback<NonNullable<BottomSheetModalProps['onChange']>>(
    (index, position, type) => {
      if (Platform.OS === 'android') {
        const visible = index >= 0;
        if (visible && !subscriptionRef.current) {
          subscriptionRef.current = BackHandler.addEventListener('hardwareBackPress', () => {
            dismissBottomSheet(ref);
            return true;
          });
        } else if (!visible && subscriptionRef.current) {
          subscriptionRef.current.remove();
          subscriptionRef.current = null;
        }
      }

      onChange?.(index, position, type);
    },
    [onChange, ref]
  );
}

export const AppBottomSheetModal = forwardRef<BottomSheetModalType, BottomSheetModalProps>(
  function AppBottomSheetModal({ onChange, ...props }, ref) {
    const handleChange = useBottomSheetBackHandler(ref, onChange);
    return <BottomSheetModal ref={ref} onChange={handleChange} {...props} />;
  }
);
