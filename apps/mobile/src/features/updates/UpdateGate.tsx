import { type ReactNode } from 'react';
import { Platform } from 'react-native';
import { UpdateRequiredModal } from '@/components/updates/UpdateRequiredModal';
import { useNativeUpdateCheck } from '@/features/updates/useNativeUpdateCheck';

type Props = {
  children: ReactNode;
};

export function UpdateGate({ children }: Props) {
  const enabled = !__DEV__ && Platform.OS !== 'web';
  const { state, dismissOptional } = useNativeUpdateCheck(enabled);

  const modalVisible = state.kind === 'required' || state.kind === 'optional';
  const info = state.kind === 'required' || state.kind === 'optional' ? state.info : null;
  const required = state.kind === 'required';
  const blocked = state.kind === 'required';

  return (
    <>
      {!blocked ? children : null}
      <UpdateRequiredModal
        visible={modalVisible}
        info={info}
        required={required}
        onDismiss={required ? undefined : dismissOptional}
      />
    </>
  );
}
