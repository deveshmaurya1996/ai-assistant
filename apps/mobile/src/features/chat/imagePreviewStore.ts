import { create } from 'zustand';
import {
  authenticatedFileHeaders,
  cacheAuthenticatedFile,
} from '@/lib/authenticated-file';
import { useAttachmentPreviewStore } from './attachmentPreviewStore';

export type ImagePreviewSource = {
  uri: string;
  headers?: Record<string, string>;
  filename?: string;
};

type ImagePreviewState = {
  visible: boolean;
  index: number;
  images: ImagePreviewSource[];
  open: (images: ImagePreviewSource[], index?: number) => void;
  close: () => void;
  setIndex: (index: number) => void;
};

export function previewHeadersForUri(uri: string): Record<string, string> | undefined {
  if (
    uri.startsWith('file:') ||
    uri.startsWith('content:') ||
    uri.startsWith('blob:') ||
    uri.startsWith('data:')
  ) {
    return undefined;
  }
  return authenticatedFileHeaders();
}

export const useImagePreviewStore = create<ImagePreviewState>((set) => ({
  visible: false,
  index: 0,
  images: [],
  open: (images, index = 0) => {
    if (!images.length) return;
    set({
      visible: true,
      images,
      index: Math.min(Math.max(index, 0), images.length - 1),
    });
  },
  close: () => set({ visible: false, images: [], index: 0 }),
  setIndex: (index) => set({ index }),
}));

export function openChatLocalImagePreview(uri: string, filename?: string) {
  useImagePreviewStore.getState().open([{ uri, filename }]);
}

export async function openChatFileImagePreview(fileId: string) {
  const local = useAttachmentPreviewStore.getState().byFileId[fileId];
  const uri = local ?? (await cacheAuthenticatedFile(fileId));
  useImagePreviewStore.getState().open([
    {
      uri,
      headers: previewHeadersForUri(uri),
    },
  ]);
}

export function toExpoImageSource(item: ImagePreviewSource) {
  const { uri, headers } = item;
  if (!headers) {
    return { uri };
  }
  if (uri.startsWith('blob:') || uri.startsWith('data:') || uri.startsWith('http')) {
    return { uri };
  }
  return { uri, headers };
}
