import { create } from 'zustand';

type State = {
  byFileId: Record<string, string>;
  setPreview: (fileId: string, localUri: string) => void;
  removePreview: (fileId: string) => void;
};

export const useAttachmentPreviewStore = create<State>((set) => ({
  byFileId: {},
  setPreview: (fileId, localUri) =>
    set((s) => ({
      byFileId: { ...s.byFileId, [fileId]: localUri },
    })),
  removePreview: (fileId) =>
    set((s) => {
      const next = { ...s.byFileId };
      delete next[fileId];
      return { byFileId: next };
    }),
}));
