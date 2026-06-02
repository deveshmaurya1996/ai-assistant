import type { FileAssetResponse } from '@ai-assistant/types';

export type LocalFileSource = {
  uri: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  webFile?: File;
};

export type UploadItemStatus = 'pending' | 'uploading' | 'done' | 'error';

export type PendingUpload<TMeta = undefined> = {
  localId: string;
  source: LocalFileSource;
  status: UploadItemStatus;
  error?: string;
  result?: FileAssetResponse;
  meta?: TMeta;
};

export type UploadQueueLimits = {
  maxItems?: number;
  maxImageBytes?: number;
  maxFileBytes?: number;
};

export type ValidateUploadContext<TMeta = undefined> = {
  existing: PendingUpload<TMeta>[];
  incoming: LocalFileSource;
};

export type ValidateUploadResult =
  | { ok: true }
  | { ok: false; message: string; alertTitle?: string };
