import type { Readable } from 'node:stream';
import { prisma } from '@ai-assistant/database';
import {
  buildUserFileKey,
  getFileStorage,
  getLocalDiskStorage,
} from '@ai-assistant/storage';
import type { ChatAttachmentRef } from '@ai-assistant/types';
import { enqueueIngestionJob } from '../lib/runtime-clients';
import { getFileRegistryRecord } from './file-registry.service';
import { invalidateCognitiveManifestCache } from './manifest-invalidation.service';

export const FILE_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxImageBytes: 10 * 1024 * 1024,
} as const;

export function attachmentKind(mimeType: string): 'image' | 'file' {
  return mimeType.startsWith('image/') ? 'image' : 'file';
}

export function toChatAttachmentRef(asset: {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): ChatAttachmentRef {
  return {
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mimeType,
    kind: attachmentKind(asset.mimeType),
    sizeBytes: asset.sizeBytes,
  };
}

export async function assertFileAccess(userId: string, fileId: string) {
  return getFileRegistryRecord(userId, fileId);
}

export function enqueueFileIndex(userId: string, fileAssetId: string): void {
  enqueueIngestionJob(
    '/v1/files/index',
    { userId, fileAssetId },
    `file:${fileAssetId}`
  );
}

export async function readUserFileBytes(storageKey: string): Promise<Buffer> {
  return getFileStorage().getObject(storageKey);
}

export function openUserFileReadStream(storageKey: string): Readable {
  const local = getLocalDiskStorage();
  if (local) {
    return local.createReadStream(storageKey);
  }
  throw new Error('Streaming download requires local storage; use buffered GET for R2');
}

export async function uploadUserFile(params: {
  userId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  source?: 'upload' | 'device' | 'chat';
  devicePath?: string;
  deviceModifiedAt?: Date;
}): Promise<{
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
  indexedAt: Date | null;
  status: string;
}> {
  const { userId, filename, mimeType, buffer, source = 'upload', devicePath, deviceModifiedAt } =
    params;
  const isImage = mimeType.startsWith('image/');
  const maxBytes = isImage ? FILE_LIMITS.maxImageBytes : FILE_LIMITS.maxFileBytes;
  if (buffer.length > maxBytes) {
    throw new Error(
      `File too large (max ${Math.round(maxBytes / (1024 * 1024))} MB)`
    );
  }

  if (devicePath) {
    const existing = await prisma.fileAsset.findFirst({
      where: { userId, devicePath },
    });
    if (existing) {
      const sameVersion =
        deviceModifiedAt &&
        existing.deviceModifiedAt &&
        existing.deviceModifiedAt.getTime() === deviceModifiedAt.getTime() &&
        existing.sizeBytes === buffer.length;
      if (sameVersion && existing.status === 'ready') {
        return existing;
      }
      if (sameVersion && existing.status !== 'failed') {
        return existing;
      }
    }
  }

  const asset = devicePath
    ? await prisma.fileAsset.upsert({
        where: {
          userId_devicePath: { userId, devicePath },
        },
        create: {
          userId,
          filename,
          mimeType,
          sizeBytes: buffer.length,
          storageKey: 'pending',
          status: 'pending',
          source,
          devicePath,
          deviceModifiedAt: deviceModifiedAt ?? null,
        },
        update: {
          filename,
          mimeType,
          sizeBytes: buffer.length,
          storageKey: 'pending',
          status: 'pending',
          source,
          deviceModifiedAt: deviceModifiedAt ?? null,
          summary: null,
          chunkCount: 0,
          indexedAt: null,
        },
      })
    : await prisma.fileAsset.create({
        data: {
          userId,
          filename,
          mimeType,
          sizeBytes: buffer.length,
          storageKey: 'pending',
          status: 'pending',
          source,
        },
      });

  const storageKey = buildUserFileKey(userId, asset.id, filename);
  const storage = getFileStorage();

  try {
    await storage.putObject({
      key: storageKey,
      body: buffer,
      contentType: mimeType,
    });
  } catch (err) {
    await prisma.fileAsset.delete({ where: { id: asset.id } }).catch(() => undefined);
    throw err;
  }

  const updated = await prisma.fileAsset.update({
    where: { id: asset.id },
    data: {
      storageKey,
      storageBackend: storage.backend,
    },
  });

  const filesConnectionId = `files_${userId}`;
  await prisma.userConnection.upsert({
    where: { id: filesConnectionId },
    create: {
      id: filesConnectionId,
      userId,
      providerId: 'files',
      status: 'ACTIVE',
      scopes: [],
    },
    update: { status: 'ACTIVE' },
  });

  invalidateCognitiveManifestCache(userId);

  return updated;
}

export async function getUserFileForDownload(userId: string, fileId: string) {
  const asset = await assertFileAccess(userId, fileId);
  return asset;
}
