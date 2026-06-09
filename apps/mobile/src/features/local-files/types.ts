import type { DeviceFilesSource } from '@ai-assistant/types';

export type LocalFileCandidate = {
  devicePath: string;
  filename: string;
  uri: string;
  mimeType?: string;
  sizeBytes?: number;
  modifiedAt?: string;
  source: DeviceFilesSource;
};

export type LocalFileSyncProgress = {
  phase: 'idle' | 'scanning' | 'uploading' | 'indexing' | 'done' | 'error';
  current?: string;
  uploaded: number;
  skipped: number;
  failed: number;
  total: number;
  message?: string;
};
