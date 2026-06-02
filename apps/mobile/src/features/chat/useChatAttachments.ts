import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { ChatAttachmentKind, ChatAttachmentRef } from '@ai-assistant/types';
import {
  isImageMime,
  resolveUploadMimeType,
  useUploadQueue,
  type LocalFileSource,
  type PendingUpload,
} from '@/features/upload';
import { useAttachmentPreviewStore } from './attachmentPreviewStore';

export type PendingAttachment = {
  localId: string;
  uri: string;
  filename: string;
  mimeType: string;
  kind: ChatAttachmentKind;
  sizeBytes?: number;
  uploading?: boolean;
  error?: string;
  uploaded?: ChatAttachmentRef;
};

type ChatUploadMeta = {
  kind: ChatAttachmentKind;
  chatRef?: ChatAttachmentRef;
};

const MAX_ATTACHMENTS = 4;
const MAX_IMAGES = 1;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function kindFromMime(mimeType: string): ChatAttachmentKind {
  return isImageMime(mimeType) ? 'image' : 'file';
}

function countImages(items: PendingUpload<ChatUploadMeta>[]): number {
  return items.filter((i) => i.meta?.kind === 'image' && !i.error).length;
}

function toChatRef(
  asset: { id: string; filename: string; mimeType: string; sizeBytes: number },
  kind: ChatAttachmentKind
): ChatAttachmentRef {
  return {
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mimeType,
    kind,
    sizeBytes: asset.sizeBytes,
  };
}

function mapToPendingAttachment(
  item: PendingUpload<ChatUploadMeta>
): PendingAttachment {
  const mimeType = resolveUploadMimeType(
    item.source.filename,
    item.source.mimeType
  );
  const kind = item.meta?.kind ?? kindFromMime(mimeType);
  return {
    localId: item.localId,
    uri: item.source.uri,
    filename: item.source.filename,
    mimeType,
    kind,
    sizeBytes: item.source.sizeBytes,
    uploading: item.status === 'uploading',
    error: item.error,
    uploaded: item.meta?.chatRef,
  };
}

export function useChatAttachments() {
  const setPreview = useAttachmentPreviewStore((s) => s.setPreview);
  const removePreview = useAttachmentPreviewStore((s) => s.removePreview);

  const queue = useUploadQueue<ChatUploadMeta>({
    limits: { maxItems: MAX_ATTACHMENTS },
    validate: ({ existing, incoming }) => {
      const mimeType = resolveUploadMimeType(
        incoming.filename,
        incoming.mimeType
      );
      const kind = kindFromMime(mimeType);

      if (incoming.sizeBytes) {
        const max = kind === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
        if (incoming.sizeBytes > max) {
          return {
            ok: false,
            alertTitle: 'File too large',
            message: `Max ${Math.round(max / (1024 * 1024))} MB for ${kind === 'image' ? 'images' : 'files'}.`,
          };
        }
      }

      if (kind === 'image' && countImages(existing) >= MAX_IMAGES) {
        return {
          ok: false,
          alertTitle: 'One image only',
          message: 'Remove the current image to attach another.',
        };
      }

      return { ok: true };
    },
  });

  const items = useMemo(
    () => queue.items.map(mapToPendingAttachment),
    [queue.items]
  );

  const hasImage = countImages(queue.items) >= MAX_IMAGES;
  const canAddImage = !hasImage;

  const addSource = useCallback(
    (source: LocalFileSource, kind: ChatAttachmentKind) => {
      queue.add(source, { meta: { kind } });
    },
    [queue]
  );

  const addItem = useCallback(
    (item: Omit<PendingAttachment, 'localId' | 'uploading' | 'uploaded'>) => {
      addSource(
        {
          uri: item.uri,
          filename: item.filename,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          webFile: undefined,
        },
        item.kind
      );
    },
    [addSource]
  );

  const removeItem = useCallback(
    (localId: string) => {
      const target = queue.items.find((i) => i.localId === localId);
      if (target?.meta?.chatRef?.id) {
        removePreview(target.meta.chatRef.id);
      }
      queue.remove(localId);
    },
    [queue, removePreview]
  );

  const addCameraPhoto = useCallback(
    (capture: {
      uri: string;
      filename: string;
      mimeType: string;
      sizeBytes?: number;
    }) => {
      for (const item of queue.items) {
        if (item.meta?.kind === 'image' && item.meta.chatRef?.id) {
          removePreview(item.meta.chatRef.id);
        }
      }
      queue.setItems((prev) => prev.filter((i) => i.meta?.kind !== 'image'));
      addSource(
        {
          uri: capture.uri,
          filename: capture.filename,
          mimeType: capture.mimeType,
          sizeBytes: capture.sizeBytes,
        },
        'image'
      );
    },
    [addSource, queue, removePreview]
  );

  const pickGallery = useCallback(async () => {
    if (!canAddImage) {
      Alert.alert('One image only', 'Remove the current image to pick another.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Photo library permission is required');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: false,
      selectionLimit: 1,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    for (const item of queue.items) {
      if (item.meta?.kind === 'image' && item.meta.chatRef?.id) {
        removePreview(item.meta.chatRef.id);
      }
    }
    queue.setItems((prev) => prev.filter((i) => i.meta?.kind !== 'image'));
    addSource(
      {
        uri: asset.uri,
        filename: asset.fileName ?? `image-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        sizeBytes: asset.fileSize,
      },
      'image'
    );
  }, [addSource, canAddImage, queue, removePreview]);

  const pickFiles = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    queue.addMany(
      result.assets.map((asset) => {
        const filename = asset.name ?? 'document';
        const mimeType = resolveUploadMimeType(filename, asset.mimeType ?? undefined);
        return {
          uri: asset.uri,
          filename,
          mimeType,
          sizeBytes: asset.size,
          webFile: asset.file ?? undefined,
          meta: { kind: kindFromMime(mimeType) },
        };
      })
    );
  }, [queue]);

  const uploadAll = useCallback(async (): Promise<ChatAttachmentRef[]> => {
    const snapshot = [...queue.items];
    const refs: ChatAttachmentRef[] = [];

    for (const item of snapshot) {
      if (item.error) continue;
      if (item.meta?.chatRef) {
        refs.push(item.meta.chatRef);
        continue;
      }

      try {
        const result = await queue.uploadOne(item);
        if (!result) continue;

        const kind = item.meta?.kind ?? kindFromMime(result.mimeType);
        const chatRef = toChatRef(result, kind);

        queue.setItems((prev) =>
          prev.map((p) =>
            p.localId === item.localId
              ? {
                  ...p,
                  meta: { kind, chatRef },
                }
              : p
          )
        );

        if (kind === 'image') {
          setPreview(chatRef.id, item.source.uri);
        }
        refs.push(chatRef);
      } catch {
        throw new Error(
          queue.items.find((i) => i.error)?.error ?? 'Upload failed'
        );
      }
    }

    return refs;
  }, [queue, setPreview]);

  return {
    items,
    canAddMore: queue.canAddMore,
    canAddImage,
    hasImage,
    isUploading: queue.isUploading,
    addItem,
    removeItem,
    clearAll: queue.clear,
    addCameraPhoto,
    pickGallery,
    pickFiles,
    uploadAll,
  };
}
