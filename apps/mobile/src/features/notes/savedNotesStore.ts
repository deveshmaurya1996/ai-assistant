import { create } from 'zustand';

type SavedNotesState = {
  savedMessageIds: Set<string>;
  revision: number;
  setSavedMessageIds: (ids: Iterable<string>) => void;
  addSavedMessageId: (id: string) => void;
  removeSavedMessageId: (id: string) => void;
};

export const useSavedNotesStore = create<SavedNotesState>((set) => ({
  savedMessageIds: new Set<string>(),
  revision: 0,
  setSavedMessageIds: (ids) =>
    set((state) => ({
      savedMessageIds: new Set(ids),
      revision: state.revision + 1,
    })),
  addSavedMessageId: (id) =>
    set((state) => {
      const next = new Set(state.savedMessageIds);
      next.add(id);
      return { savedMessageIds: next, revision: state.revision + 1 };
    }),
  removeSavedMessageId: (id) =>
    set((state) => {
      const next = new Set(state.savedMessageIds);
      next.delete(id);
      return { savedMessageIds: next, revision: state.revision + 1 };
    }),
}));
