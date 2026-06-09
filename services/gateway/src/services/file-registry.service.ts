import { prisma } from '@ai-assistant/database';
import { forbidden, notFound } from '../lib/errors';

export type FileRegistryRecord = {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  storageBackend: string;
  status: string;
  summary: string | null;
  analysis: unknown;
  chunkCount: number;
  indexedAt: Date | null;
  createdAt: Date;
};

export async function getFileRegistryRecord(
  userId: string,
  fileId: string
): Promise<FileRegistryRecord> {
  const asset = await prisma.fileAsset.findUnique({ where: { id: fileId } });
  if (!asset) throw notFound('File not found');
  if (asset.userId !== userId) throw forbidden('Access denied');
  return asset;
}

const BULK_STATUS_MAX_IDS = 50;

export async function getFileBulkStatus(
  userId: string,
  ids: string[]
): Promise<Array<{ id: string; status: string; indexedAt: string | null }>> {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))].slice(
    0,
    BULK_STATUS_MAX_IDS
  );
  if (unique.length === 0) return [];

  const rows = await prisma.fileAsset.findMany({
    where: { userId, id: { in: unique } },
    select: { id: true, status: true, indexedAt: true },
  });

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    indexedAt: row.indexedAt?.toISOString() ?? null,
  }));
}

export async function listUserFileRegistry(
  userId: string,
  options?: { status?: string; limit?: number }
): Promise<FileRegistryRecord[]> {
  const limit = options?.limit ?? 50;
  return prisma.fileAsset.findMany({
    where: {
      userId,
      ...(options?.status ? { status: options.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function updateFileRegistryStatus(
  fileId: string,
  data: {
    status?: string;
    summary?: string | null;
    analysis?: unknown;
    chunkCount?: number;
    indexedAt?: Date | null;
  }
) {
  return prisma.fileAsset.update({
    where: { id: fileId },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.summary !== undefined ? { summary: data.summary } : {}),
      ...(data.analysis !== undefined ? { analysis: data.analysis as object } : {}),
      ...(data.chunkCount !== undefined ? { chunkCount: data.chunkCount } : {}),
      ...(data.indexedAt !== undefined ? { indexedAt: data.indexedAt } : {}),
    },
  });
}

export type SessionFileContext = {
  lastReferencedFileIds?: string[];
};

export function parseSessionFileContext(raw: unknown): SessionFileContext {
  if (!raw || typeof raw !== 'object') return {};
  const ctx = raw as SessionFileContext;
  if (!Array.isArray(ctx.lastReferencedFileIds)) return {};
  return {
    lastReferencedFileIds: ctx.lastReferencedFileIds.filter(
      (id): id is string => typeof id === 'string'
    ),
  };
}

export async function updateSessionFileContext(
  sessionId: string,
  patch: SessionFileContext
): Promise<void> {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  const current = parseSessionFileContext(session.context);
  const merged: SessionFileContext = {
    lastReferencedFileIds: [
      ...(patch.lastReferencedFileIds ?? []),
      ...(current.lastReferencedFileIds ?? []),
    ].filter((id, i, arr) => arr.indexOf(id) === i),
  };

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { context: merged as object },
  });
}

export async function getSessionFileContext(
  sessionId: string
): Promise<SessionFileContext> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { context: true },
  });
  return parseSessionFileContext(session?.context);
}
