import { prisma } from '@ai-assistant/database';

export type ResourceHit = {
  id: string;
  provider: string;
  title: string;
  snippet?: string;
  mimeType?: string;
  url?: string;
  timestamp?: string;
};

export type ResourceSearchOpts = {
  limit?: number;
  providers?: string[];
};

/** DB + index search (Phase 4). Live provider fan-out merges via `extraHits`. */
export async function resourceDomainSearch(
  userId: string,
  query: string,
  opts?: ResourceSearchOpts
): Promise<ResourceHit[]> {
  const limit = opts?.limit ?? 20;
  const allowed = opts?.providers;
  const hits: ResourceHit[] = [];

  const includeProvider = (p: string) => !allowed?.length || allowed.includes(p);

  if (includeProvider('whatsapp')) {
    const wa = await prisma.integrationMessage.findMany({
      where: {
        thread: { userId, provider: 'whatsapp' },
        body: { contains: query, mode: 'insensitive' },
      },
      include: { thread: true },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });
    for (const m of wa) {
      hits.push({
        id: m.externalId,
        provider: 'whatsapp',
        title: m.thread.displayName ?? m.thread.externalJid,
        snippet: m.body ?? undefined,
        timestamp: m.sentAt.toISOString(),
      });
    }
  }

  if (includeProvider('google') || includeProvider('gmail') || includeProvider('drive')) {
    const indexed = await prisma.indexedResource.findMany({
      where: {
        connection: { userId, status: 'ACTIVE' },
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { snippet: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
    });
    for (const r of indexed) {
      hits.push({
        id: r.externalId,
        provider: r.provider,
        title: r.title ?? r.externalId,
        snippet: r.snippet ?? undefined,
        mimeType: r.mimeType ?? undefined,
        url: r.url ?? undefined,
        timestamp: r.modifiedAt?.toISOString(),
      });
    }
  }

  return hits.slice(0, limit);
}

export async function searchMessagingMessages(
  userId: string,
  query: string,
  limit = 20
): Promise<{
  type: 'messaging.search_result';
  items: Array<{
    chatId: string;
    sender: string;
    body: string;
    timestamp: string;
    messageId: string;
  }>;
}> {
  const rows = await prisma.integrationMessage.findMany({
    where: {
      thread: { userId, provider: 'whatsapp' },
      body: { contains: query, mode: 'insensitive' },
    },
    include: { thread: true },
    orderBy: { sentAt: 'desc' },
    take: limit,
  });

  return {
    type: 'messaging.search_result',
    items: rows.map((r) => ({
      chatId: r.thread.externalJid,
      sender: r.thread.displayName ?? r.thread.externalJid,
      body: r.body ?? '',
      timestamp: r.sentAt.toISOString(),
      messageId: r.externalId,
    })),
  };
}

export function mergeResourceHits(
  base: ResourceHit[],
  extra: ResourceHit[],
  limit = 20
): ResourceHit[] {
  const seen = new Set<string>();
  const out: ResourceHit[] = [];
  for (const h of [...base, ...extra]) {
    const key = `${h.provider}:${h.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
