import { create } from 'zustand';

function sameIdSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

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
    set((state) => {
      const next = new Set(ids);
      if (sameIdSet(state.savedMessageIds, next)) {
        return state;
      }
      return { savedMessageIds: next, revision: state.revision + 1 };
    }),
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
