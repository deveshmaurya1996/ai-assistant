import { create } from 'zustand';
import type { ActionConfirmRequiredPayload } from '@ai-assistant/types';

type Handlers = {
  confirm: () => void;
  cancel: () => void;
};

type State = {
  pendingAction: ActionConfirmRequiredPayload | null;
  handlers: Handlers | null;
  setPending: (payload: ActionConfirmRequiredPayload | null) => void;
  registerHandlers: (handlers: Handlers | null) => void;
  confirmPendingAction: () => void;
  cancelPendingAction: () => void;
};

export const useChatActionConfirmBridge = create<State>((set, get) => ({
  pendingAction: null,
  handlers: null,
  setPending: (pendingAction) => set({ pendingAction }),
  registerHandlers: (handlers) => set({ handlers }),
  confirmPendingAction: () => {
    const { handlers, pendingAction } = get();
    if (!pendingAction || !handlers) return;
    set({ pendingAction: null });
    handlers.confirm();
  },
  cancelPendingAction: () => {
    const { handlers } = get();
    handlers?.cancel();
    set({ pendingAction: null });
  },
}));
