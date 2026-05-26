import { create } from 'zustand';

type SavedNotesState = {
  savedMessageIds: Set<string>;
  setSavedMessageIds: (ids: Iterable<string>) => void;
  addSavedMessageId: (id: string) => void;
  removeSavedMessageId: (id: string) => void;
};

export const useSavedNotesStore = create<SavedNotesState>((set) => ({
  savedMessageIds: new Set<string>(),
  setSavedMessageIds: (ids) => set({ savedMessageIds: new Set(ids) }),
  addSavedMessageId: (id) =>
    set((state) => {
      const next = new Set(state.savedMessageIds);
      next.add(id);
      return { savedMessageIds: next };
    }),
  removeSavedMessageId: (id) =>
    set((state) => {
      const next = new Set(state.savedMessageIds);
      next.delete(id);
      return { savedMessageIds: next };
    }),
}));
