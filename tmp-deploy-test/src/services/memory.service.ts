import type { MemoryType } from '@ai-assistant/types';
import { prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { fetchAi } from '../lib/http';
import { upsertCuratedMemory, safeIngestConversationVector } from './memory-curated';
import { shouldExtractFacts } from './memory-extract-policy';
import {
  isExplicitRememberIntent,
  parseExplicitRememberContent,
} from './memory-explicit';

function isMemoryExtractionEnabled(): boolean {
  const raw = (process.env.MEMORY_EXTRACTION_ENABLED ?? 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

function isEpisodicPostgresEnabled(): boolean {
  const raw = (process.env.MEMORY_EPISODIC_POSTGRES ?? 'false').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export async function ingestConversationMemory(
  userId: string,
  userText: string,
  assistantText: string,
  chatSessionId?: string
) {
  const explicitContent = parseExplicitRememberContent(userText);
  if (explicitContent) {
    await upsertCuratedMemory(userId, {
      content: explicitContent,
      type: 'FACT',
      source: 'explicit_remember',
    });
    return;
  }

  if (isExplicitRememberIntent(userText)) {
    if (isMemoryExtractionEnabled()) {
      await extractAndStoreFacts(userId, userText, assistantText, { explicitSave: true });
    }
    return;
  }

  const content = `User: ${userText}\nAssistant: ${assistantText}`;

  const embeddingId = await safeIngestConversationVector(
    userId,
    content,
    chatSessionId
  );

  if (isEpisodicPostgresEnabled()) {
    const item = await prisma.memoryItem.create({
      data: {
        userId,
        type: 'CONVERSATION',
        content,
        embeddingId,
        metadata: {
          source: 'chat',
          memory_kind: 'conversation',
          type: 'conversation',
          ...(chatSessionId ? { chatSessionId } : {}),
        },
      },
    });
    await publishEvent(EventNames.MEMORY_SAVED, {
      userId,
      memoryItemId: item.id,
      type: 'CONVERSATION',
    }).catch(() => undefined);
  }

  if (isMemoryExtractionEnabled() && shouldExtractFacts(userText, assistantText)) {
    void extractAndStoreFacts(userId, userText, assistantText).catch((err) => {
      console.error(
        '[memory] fact extraction failed:',
        err instanceof Error ? err.message : err
      );
    });
  }
}

export async function extractAndStoreFacts(
  userId: string,
  userText: string,
  assistantText: string,
  options?: { explicitSave?: boolean }
) {
  const data = await fetchAi<{
    success: boolean;
    facts: Array<{ type: string; content: string }>;
  }>('/v1/memory/extract', {
    method: 'POST',
    body: JSON.stringify({
      user_text: userText,
      assistant_text: assistantText,
      explicit_save: options?.explicitSave === true,
    }),
  });

  for (const fact of data.facts ?? []) {
    const content = fact.content?.trim();
    if (!content) continue;

    const memoryType: MemoryType =
      fact.type === 'PREFERENCE' ? 'PREFERENCE' : 'FACT';

    await upsertCuratedMemory(userId, {
      content,
      type: memoryType,
      source: options?.explicitSave ? 'explicit_remember' : 'extraction',
    });
  }
}

/** Remove legacy CONVERSATION rows from Postgres (episodic recall uses Qdrant). */
export async function cleanupLegacyConversationMemoryRows(): Promise<number> {
  const result = await prisma.memoryItem.deleteMany({
    where: { type: 'CONVERSATION' },
  });
  if (result.count > 0) {
    console.info('[memory] removed %d legacy CONVERSATION row(s) from Postgres', result.count);
  }
  return result.count;
}

export async function deleteMemoryItem(userId: string, memoryItemId: string): Promise<boolean> {
  const item = await prisma.memoryItem.findFirst({
    where: { id: memoryItemId, userId },
  });
  if (!item) return false;

  if (item.embeddingId) {
    try {
      await fetchAi(`/v1/memory/points/${encodeURIComponent(item.embeddingId)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.warn(
        '[memory] vector delete failed:',
        err instanceof Error ? err.message : err
      );
    }
  }

  await prisma.memoryItem.delete({ where: { id: item.id } });
  return true;
}

export async function listCuratedFacts(userId: string, limit = 5) {
  return prisma.memoryItem.findMany({
    where: {
      userId,
      type: { in: ['FACT', 'PREFERENCE'] },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, type: true, content: true, updatedAt: true },
  });
}

export async function listMemoryItemsForUser(
  userId: string,
  options?: { type?: MemoryType; includeConversations?: boolean; take?: number }
) {
  const take = options?.take ?? 50;
  const type = options?.type;
  const includeConversations = options?.includeConversations ?? false;

  if (type) {
    return prisma.memoryItem.findMany({
      where: { userId, type },
      orderBy: { updatedAt: 'desc' },
      take,
    });
  }

  const types: MemoryType[] = includeConversations
    ? ['FACT', 'PREFERENCE', 'CONVERSATION']
    : ['FACT', 'PREFERENCE'];

  return prisma.memoryItem.findMany({
    where: { userId, type: { in: types } },
    orderBy: { updatedAt: 'desc' },
    take,
  });
}

export async function deleteEpisodicMemoryForSession(
  userId: string,
  chatSessionId: string
): Promise<void> {
  await fetchAi<{ success: boolean; deleted: number }>(
    `/v1/memory/session/${encodeURIComponent(chatSessionId)}?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE', timeoutMs: 15_000 }
  );
}
