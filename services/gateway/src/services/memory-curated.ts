import { createHash } from 'node:crypto';
import type { MemoryType } from '@ai-assistant/types';
import { prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { fetchAi } from '../lib/http';

const MAX_FACT_LENGTH = 500;
const FINGERPRINT_LOOKUP_LIMIT = 200;

type IngestResponse = { success: boolean; ids?: string[] };

export function normalizeFactContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FACT_LENGTH);
}

export function factFingerprint(content: string): string {
  return createHash('sha256').update(normalizeFactContent(content)).digest('hex');
}

async function ingestToVector(
  userId: string,
  text: string,
  metadata: Record<string, unknown>
): Promise<string | null> {
  const data = await fetchAi<IngestResponse>('/v1/memory/ingest', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      documents: [{ text, metadata }],
    }),
  });
  return data.ids?.[0] ?? null;
}

async function safeIngestToVector(
  userId: string,
  text: string,
  metadata: Record<string, unknown>
): Promise<string | null> {
  try {
    return await ingestToVector(userId, text, metadata);
  } catch (err) {
    console.warn(
      '[memory] vector ingest failed (Postgres row still saved):',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

async function deleteVectorPoint(embeddingId: string): Promise<void> {
  try {
    await fetchAi(`/v1/memory/points/${encodeURIComponent(embeddingId)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn(
      '[memory] vector delete failed:',
      err instanceof Error ? err.message : err
    );
  }
}

function metadataFingerprint(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fp = (value as Record<string, unknown>).fingerprint;
  return typeof fp === 'string' ? fp : null;
}

async function findCuratedByFingerprint(
  userId: string,
  fingerprint: string
): Promise<{ id: string; embeddingId: string | null; content: string } | null> {
  const recent = await prisma.memoryItem.findMany({
    where: { userId, type: { in: ['FACT', 'PREFERENCE'] } },
    orderBy: { updatedAt: 'desc' },
    take: FINGERPRINT_LOOKUP_LIMIT,
    select: { id: true, embeddingId: true, content: true, metadata: true },
  });

  for (const row of recent) {
    if (metadataFingerprint(row.metadata) === fingerprint) {
      return row;
    }
  }
  return null;
}

export type UpsertCuratedMemoryParams = {
  content: string;
  type: MemoryType;
  source: string;
  sessionId?: string;
};

export type UpsertCuratedMemoryResult = {
  id: string;
  action: 'created' | 'updated';
};

export async function upsertCuratedMemory(
  userId: string,
  params: UpsertCuratedMemoryParams
): Promise<UpsertCuratedMemoryResult | null> {
  const content = params.content.trim().slice(0, MAX_FACT_LENGTH);
  if (content.length < 3) return null;

  const memoryType: MemoryType =
    params.type === 'PREFERENCE' ? 'PREFERENCE' : 'FACT';
  const fingerprint = factFingerprint(content);
  const vectorMetadata = {
    type: memoryType.toLowerCase(),
    memory_kind: 'fact',
    source: params.source,
    fingerprint,
  };

  const existing = await findCuratedByFingerprint(userId, fingerprint);

  if (existing) {
    if (existing.embeddingId) {
      await deleteVectorPoint(existing.embeddingId);
    }
    const embeddingId = await safeIngestToVector(userId, content, vectorMetadata);
    const item = await prisma.memoryItem.update({
      where: { id: existing.id },
      data: {
        content,
        type: memoryType,
        embeddingId,
        metadata: {
          source: params.source,
          memory_kind: 'fact',
          type: memoryType.toLowerCase(),
          fingerprint,
          ...(params.sessionId ? { sessionId: params.sessionId } : {}),
        },
      },
    });
    await publishEvent(EventNames.MEMORY_SAVED, {
      userId,
      memoryItemId: item.id,
      type: memoryType,
    }).catch(() => undefined);
    return { id: item.id, action: 'updated' };
  }

  const embeddingId = await safeIngestToVector(userId, content, vectorMetadata);
  const item = await prisma.memoryItem.create({
    data: {
      userId,
      type: memoryType,
      content,
      embeddingId,
      metadata: {
        source: params.source,
        memory_kind: 'fact',
        type: memoryType.toLowerCase(),
        fingerprint,
        ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      },
    },
  });
  await publishEvent(EventNames.MEMORY_SAVED, {
    userId,
    memoryItemId: item.id,
    type: memoryType,
  }).catch(() => undefined);
  return { id: item.id, action: 'created' };
}

export async function safeIngestConversationVector(
  userId: string,
  content: string,
  chatSessionId?: string
): Promise<string | null> {
  const metadata: Record<string, unknown> = {
    type: 'conversation',
    memory_kind: 'conversation',
    source: 'chat',
  };
  if (chatSessionId) {
    metadata.chat_session_id = chatSessionId;
  }
  return safeIngestToVector(userId, content, metadata);
}
