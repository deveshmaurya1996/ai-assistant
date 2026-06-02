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
  const { userId, filename, mimeType, buffer } = params;
  const isImage = mimeType.startsWith('image/');
  const maxBytes = isImage ? FILE_LIMITS.maxImageBytes : FILE_LIMITS.maxFileBytes;
  if (buffer.length > maxBytes) {
    throw new Error(
      `File too large (max ${Math.round(maxBytes / (1024 * 1024))} MB)`
    );
  }

  const asset = await prisma.fileAsset.create({
    data: {
      userId,
      filename,
      mimeType,
      sizeBytes: buffer.length,
      storageKey: 'pending',
      status: 'pending',
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

  return updated;
}

export async function getUserFileForDownload(userId: string, fileId: string) {
  const asset = await assertFileAccess(userId, fileId);
  return asset;
}
