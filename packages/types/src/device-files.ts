export type DeviceFilesSource = 'documents' | 'photos';

export type DeviceFilesConfig = {
  enabledSources: DeviceFilesSource[];
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncStats: {
    uploaded: number;
    skipped: number;
    failed: number;
  } | null;
};

export type DeviceFilesStatus = {
  connectionId: string;
  connected: boolean;
  config: DeviceFilesConfig;
  stats: {
    deviceFilesTotal: number;
    deviceFilesIndexed: number;
    searchableFilesTotal: number;
  };
  lastSyncAt: string | null;
};

export type DeviceFileUploadMeta = {
  devicePath: string;
  deviceModifiedAt?: string;
  source?: 'device';
};

export type DeviceFileCheckItem = {
  devicePath: string;
  deviceModifiedAt?: string;
  sizeBytes?: number;
};

export type DeviceFileCheckResult = {
  upload: string[];
  skip: string[];
  pending: string[];
  pendingFileIds: Record<string, string>;
};

export type FileBulkStatusItem = {
  id: string;
  status: string;
  indexedAt: string | null;
};
