import { prisma, Prisma } from '@ai-assistant/database';
import { invalidateCognitiveManifestCache } from './manifest-invalidation.service';

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

const DEFAULT_CONFIG: DeviceFilesConfig = {
  enabledSources: ['documents', 'photos'],
  syncEnabled: true,
  lastSyncAt: null,
  lastSyncStats: null,
};

function filesConnectionId(userId: string): string {
  return `files_${userId}`;
}

export async function ensureFilesConnection(userId: string) {
  const id = filesConnectionId(userId);
  return prisma.userConnection.upsert({
    where: { id },
    create: {
      id,
      userId,
      providerId: 'files',
      status: 'ACTIVE',
      scopes: ['read'],
      metadata: { deviceSync: DEFAULT_CONFIG } as Prisma.InputJsonValue,
    },
    update: {},
  });
}

export function parseDeviceFilesConfig(metadata: unknown): DeviceFilesConfig {
  const root = (metadata ?? {}) as { deviceSync?: Partial<DeviceFilesConfig> };
  const ds = root.deviceSync ?? {};
  return {
    enabledSources:
      Array.isArray(ds.enabledSources) && ds.enabledSources.length > 0
        ? (ds.enabledSources.filter((s) => s === 'documents' || s === 'photos') as DeviceFilesSource[])
        : DEFAULT_CONFIG.enabledSources,
    syncEnabled: ds.syncEnabled !== false,
    lastSyncAt: typeof ds.lastSyncAt === 'string' ? ds.lastSyncAt : null,
    lastSyncStats:
      ds.lastSyncStats &&
      typeof ds.lastSyncStats === 'object' &&
      ds.lastSyncStats !== null
        ? {
            uploaded: Number((ds.lastSyncStats as DeviceFilesConfig['lastSyncStats'])?.uploaded ?? 0),
            skipped: Number((ds.lastSyncStats as DeviceFilesConfig['lastSyncStats'])?.skipped ?? 0),
            failed: Number((ds.lastSyncStats as DeviceFilesConfig['lastSyncStats'])?.failed ?? 0),
          }
        : null,
  };
}

export async function getDeviceFilesStatus(userId: string) {
  const connectionId = filesConnectionId(userId);
  const [connection, deviceFileCount, readyDeviceFiles, totalReadyFiles] = await Promise.all([
    prisma.userConnection.findFirst({ where: { id: connectionId, userId } }),
    prisma.fileAsset.count({ where: { userId, source: 'device' } }),
    prisma.fileAsset.count({ where: { userId, source: 'device', status: 'ready' } }),
    prisma.fileAsset.count({ where: { userId, status: 'ready' } }),
  ]);

  const config = parseDeviceFilesConfig(connection?.metadata);

  return {
    connectionId,
    connected: connection?.status === 'ACTIVE',
    config,
    stats: {
      deviceFilesTotal: deviceFileCount,
      deviceFilesIndexed: readyDeviceFiles,
      searchableFilesTotal: totalReadyFiles,
    },
    lastSyncAt: connection?.lastSyncAt?.toISOString() ?? config.lastSyncAt,
  };
}

export async function updateDeviceFilesConfig(
  userId: string,
  patch: Partial<DeviceFilesConfig>
): Promise<DeviceFilesConfig> {
  const connection = await ensureFilesConnection(userId);
  const current = parseDeviceFilesConfig(connection.metadata);
  const next: DeviceFilesConfig = {
    ...current,
    ...patch,
    enabledSources: patch.enabledSources ?? current.enabledSources,
    lastSyncStats: patch.lastSyncStats ?? current.lastSyncStats,
  };

  const meta = (connection.metadata ?? {}) as Record<string, unknown>;
  await prisma.userConnection.update({
    where: { id: connection.id },
    data: {
      status: 'ACTIVE',
      metadata: { ...meta, deviceSync: next } as Prisma.InputJsonValue,
    },
  });

  invalidateCognitiveManifestCache(userId);
  return next;
}

export async function completeDeviceSync(
  userId: string,
  stats: { uploaded: number; skipped: number; failed: number }
): Promise<DeviceFilesConfig> {
  const now = new Date();
  const connection = await ensureFilesConnection(userId);
  const current = parseDeviceFilesConfig(connection.metadata);
  const next: DeviceFilesConfig = {
    ...current,
    lastSyncAt: now.toISOString(),
    lastSyncStats: stats,
  };

  const meta = (connection.metadata ?? {}) as Record<string, unknown>;
  await prisma.userConnection.update({
    where: { id: connection.id },
    data: {
      status: 'ACTIVE',
      lastSyncAt: now,
      metadata: { ...meta, deviceSync: next } as Prisma.InputJsonValue,
    },
  });

  invalidateCognitiveManifestCache(userId);
  return next;
}

export async function findDeviceFileByPath(userId: string, devicePath: string) {
  return prisma.fileAsset.findFirst({
    where: { userId, devicePath },
  });
}

export type DeviceFileCheckInput = {
  devicePath: string;
  deviceModifiedAt?: string;
  sizeBytes?: number;
};

function isSameDeviceVersion(
  existing: { deviceModifiedAt: Date | null; sizeBytes: number },
  item: DeviceFileCheckInput
): boolean {
  if (!item.deviceModifiedAt || !existing.deviceModifiedAt) return false;
  if (existing.deviceModifiedAt.getTime() !== new Date(item.deviceModifiedAt).getTime()) {
    return false;
  }
  if (typeof item.sizeBytes === 'number') {
    return existing.sizeBytes === item.sizeBytes;
  }
  return true;
}

const DEVICE_CHECK_MAX_ITEMS = 500;

export async function checkDeviceFiles(
  userId: string,
  items: DeviceFileCheckInput[]
): Promise<{
  upload: string[];
  skip: string[];
  pending: string[];
  pendingFileIds: Record<string, string>;
}> {
  const trimmed = items
    .filter((i) => typeof i.devicePath === 'string' && i.devicePath.length > 0)
    .slice(0, DEVICE_CHECK_MAX_ITEMS);

  const paths = [...new Set(trimmed.map((i) => i.devicePath.slice(0, 512)))];
  const existing = await prisma.fileAsset.findMany({
    where: { userId, devicePath: { in: paths } },
    select: {
      id: true,
      devicePath: true,
      deviceModifiedAt: true,
      sizeBytes: true,
      status: true,
    },
  });

  const byPath = new Map(
    existing
      .filter((row) => row.devicePath)
      .map((row) => [row.devicePath as string, row])
  );

  const upload: string[] = [];
  const skip: string[] = [];
  const pending: string[] = [];
  const pendingFileIds: Record<string, string> = {};

  for (const item of trimmed) {
    const path = item.devicePath.slice(0, 512);
    const row = byPath.get(path);
    if (!row) {
      upload.push(path);
      continue;
    }

    const sameVersion = isSameDeviceVersion(row, item);
    if (sameVersion && row.status === 'ready') {
      skip.push(path);
      continue;
    }
    if (sameVersion && row.status !== 'failed') {
      pending.push(path);
      pendingFileIds[path] = row.id;
      continue;
    }

    upload.push(path);
  }

  return { upload, skip, pending, pendingFileIds };
}
