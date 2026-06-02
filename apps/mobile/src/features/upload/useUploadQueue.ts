import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { formatUploadError } from './errors';
import { uploadLocalFile } from './uploadFile';
import type {
  LocalFileSource,
  PendingUpload,
  UploadQueueLimits,
  ValidateUploadContext,
  ValidateUploadResult,
} from './types';

function newLocalId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type UseUploadQueueOptions<TMeta = undefined> = {
  limits?: UploadQueueLimits;
  validate?: (ctx: ValidateUploadContext<TMeta>) => ValidateUploadResult;
};

export function useUploadQueue<TMeta = undefined>(
  options: UseUploadQueueOptions<TMeta> = {}
) {
  const { limits, validate } = options;
  const maxItems = limits?.maxItems ?? 10;

  const [items, setItems] = useState<PendingUpload<TMeta>[]>([]);

  const isUploading = items.some((i) => i.status === 'uploading');
  const canAddMore = items.length < maxItems;

  const patchItem = useCallback(
    (localId: string, patch: Partial<PendingUpload<TMeta>>) => {
    setItems((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item))
    );
    },
    []
  );

  const add = useCallback(
    (
      source: LocalFileSource,
      opts?: { meta?: TMeta; showAlert?: boolean }
    ): boolean => {
      let added = false;
      setItems((prev) => {
        if (prev.length >= maxItems) return prev;

        if (validate) {
          const check = validate({ existing: prev, incoming: source });
          if (!check.ok) {
            if (opts?.showAlert !== false) {
              Alert.alert(check.alertTitle ?? 'Cannot add file', check.message);
            }
            return prev;
          }
        }

        added = true;
        return [
          ...prev,
          {
            localId: newLocalId(),
            source,
            status: 'pending',
            meta: opts?.meta,
          },
        ];
      });
      return added;
    },
    [maxItems, validate]
  );

  const addMany = useCallback(
    (
      sources: Array<LocalFileSource & { meta?: TMeta }>
    ) => {
      for (const { meta, ...source } of sources) {
        const added = add(source, { meta, showAlert: false });
        if (!added) break;
      }
    },
    [add]
  );

  const remove = useCallback((localId: string) => {
    setItems((prev) => prev.filter((i) => i.localId !== localId));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const uploadOne = useCallback(
    async (item: PendingUpload<TMeta>) => {
      if (item.status === 'done' && item.result) {
        return item.result;
      }
      if (item.error && item.status === 'error') {
        return null;
      }

      patchItem(item.localId, { status: 'uploading', error: undefined });

      try {
        const result = await uploadLocalFile(item.source);
        patchItem(item.localId, { status: 'done', result, error: undefined });
        return result;
      } catch (err) {
        const message = formatUploadError(err);
        patchItem(item.localId, { status: 'error', error: message });
        throw err;
      }
    },
    [patchItem]
  );

  const uploadAll = useCallback(async () => {
    const snapshot = items;
    const results = [];

    for (const item of snapshot) {
      if (item.status === 'error' && item.error) continue;
      try {
        const result = await uploadOne(item);
        if (result) results.push(result);
      } catch {
        // keep going; caller inspects items for per-file errors
      }
    }

    const failed = items.some((i) => i.status === 'error');
    if (failed && results.length === 0) {
      throw new Error(
        items.find((i) => i.error)?.error ?? 'Upload failed'
      );
    }

    return results;
  }, [items, uploadOne]);

  return {
    items,
    isUploading,
    canAddMore,
    add,
    addMany,
    remove,
    clear,
    uploadOne,
    uploadAll,
    setItems,
  };
}
