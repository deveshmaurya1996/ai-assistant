import type { DeviceFilesSource } from '@ai-assistant/types';
import { apiClient } from '@/lib/api-client';
import { prepareUploadBlob } from '@/features/upload/uploadFile';
import { resolveUploadMimeType } from '@/features/upload/mime';
import { collectDeviceFiles } from './scanDeviceFiles';
import { waitUntilFilesReady } from './indexWaiter';
import { mapWithConcurrency, UPLOAD_CONCURRENCY, withRetryOnce } from './uploadQueue';
import type { LocalFileCandidate, LocalFileSyncProgress } from './types';

const CHECK_BATCH_SIZE = 200;

export type SyncMode = 'initial' | 'incremental' | 'manual';

function emptyProgress(): LocalFileSyncProgress {
  return {
    phase: 'scanning',
    uploaded: 0,
    skipped: 0,
    failed: 0,
    total: 0,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function classifyCandidates(candidates: LocalFileCandidate[]) {
  const uploadPaths = new Set<string>();
  const skipPaths = new Set<string>();
  const pendingFileIds: string[] = [];

  for (const batch of chunk(candidates, CHECK_BATCH_SIZE)) {
    const check = await apiClient.checkDeviceFiles(
      batch.map((c) => ({
        devicePath: c.devicePath,
        deviceModifiedAt: c.modifiedAt,
        sizeBytes: c.sizeBytes,
      }))
    );

    for (const path of check.skip) skipPaths.add(path);
    for (const path of check.upload) uploadPaths.add(path);
    for (const path of check.pending) {
      const id = check.pendingFileIds[path];
      if (id) pendingFileIds.push(id);
    }
  }

  return { uploadPaths, skipPaths, pendingFileIds };
}

async function uploadCandidate(file: LocalFileCandidate): Promise<{
  ok: boolean;
  fileId?: string;
  skipped?: boolean;
}> {
  const blob = await prepareUploadBlob({
    uri: file.uri,
    filename: file.filename,
    mimeType: file.mimeType,
  });
  resolveUploadMimeType(file.filename, file.mimeType);
  const name =
    'name' in blob && typeof blob.name === 'string' && blob.name ? blob.name : file.filename;

  const uploaded = await withRetryOnce(() =>
    apiClient.uploadFilePart(blob, name, {
      devicePath: file.devicePath,
      deviceModifiedAt: file.modifiedAt,
      source: 'device',
    })
  );

  if (uploaded.indexedAt) {
    return { ok: true, skipped: true };
  }

  return { ok: true, fileId: uploaded.id };
}

export async function runDeviceFileSync(params: {
  mode: SyncMode;
  enabledSources: DeviceFilesSource[];
  since?: string | null;
  onProgress?: (progress: LocalFileSyncProgress) => void;
}): Promise<LocalFileSyncProgress> {
  const progress = emptyProgress();

  const report = (patch: Partial<LocalFileSyncProgress>) => {
    Object.assign(progress, patch);
    params.onProgress?.({ ...progress });
  };

  try {
    const sources =
      params.mode === 'incremental'
        ? (['photos'] as DeviceFilesSource[])
        : params.enabledSources;

    const candidates = await collectDeviceFiles(sources, {
      since: params.mode === 'incremental' ? params.since ?? undefined : undefined,
      onProgress: (message) => report({ message }),
      onScanCount: (count) => report({ total: count }),
    });

    report({ phase: 'uploading', total: candidates.length, message: undefined });

    if (candidates.length === 0) {
      await apiClient.completeDeviceFilesSync({
        uploaded: 0,
        skipped: 0,
        failed: 0,
      });
      report({ phase: 'done', current: undefined, message: undefined });
      return progress;
    }

    const { uploadPaths, skipPaths, pendingFileIds } = await classifyCandidates(candidates);
    report({ skipped: skipPaths.size });

    const byPath = new Map(candidates.map((c) => [c.devicePath, c]));
    const toUpload = [...uploadPaths]
      .map((path) => byPath.get(path))
      .filter((c): c is LocalFileCandidate => Boolean(c));

    const uploadResults = await mapWithConcurrency(
      toUpload,
      UPLOAD_CONCURRENCY,
      async (file) => {
        report({ current: file.filename });
        try {
          return await uploadCandidate(file);
        } catch {
          return { ok: false as const };
        }
      }
    );

    const newFileIds: string[] = [];
    for (const result of uploadResults) {
      if (!result.ok) {
        report({ failed: progress.failed + 1 });
        continue;
      }
      if (result.skipped) {
        report({ skipped: progress.skipped + 1 });
        continue;
      }
      if (result.fileId) newFileIds.push(result.fileId);
    }

    const idsToWait = [...new Set([...pendingFileIds, ...newFileIds])];
    if (idsToWait.length > 0) {
      report({ phase: 'indexing', current: undefined });
      const { ready, failed } = await waitUntilFilesReady(idsToWait);
      report({
        uploaded: progress.uploaded + ready.length,
        failed: progress.failed + failed.length,
        phase: 'uploading',
      });
    }

    await apiClient.completeDeviceFilesSync({
      uploaded: progress.uploaded,
      skipped: progress.skipped,
      failed: progress.failed,
    });

    report({ phase: 'done', current: undefined, message: undefined });
    return progress;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    report({ phase: 'error', message });
    return progress;
  }
}
