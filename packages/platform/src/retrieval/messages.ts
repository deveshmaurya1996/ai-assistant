import { prisma, Prisma } from '@ai-assistant/database';

export type MessageSearchFilters = {
  sender?: string;
  chatId?: string;
  keywords?: string | string[];
  since?: Date;
  limit?: number;
};

export type RetrievedMessage = {
  chatId: string;
  sender: string;
  body: string;
  timestamp: string;
  messageId: string;
};

export async function searchMessages(
  userId: string,
  filters: MessageSearchFilters
): Promise<{
  type: 'messaging.search_result';
  items: RetrievedMessage[];
}> {
  const limit = filters.limit ?? 20;
  const keywords = Array.isArray(filters.keywords)
    ? filters.keywords
    : filters.keywords
      ? [filters.keywords]
      : [];

  const threadWhere: Prisma.ChatThreadWhereInput = {
    userId,
    provider: 'whatsapp',
  };
  if (filters.chatId) {
    threadWhere.externalJid = filters.chatId;
  }
  if (filters.sender?.trim()) {
    threadWhere.displayName = { contains: filters.sender.trim(), mode: 'insensitive' };
  }

  const messageWhere: Prisma.IntegrationMessageWhereInput = {
    thread: threadWhere,
  };
  if (filters.since) {
    messageWhere.sentAt = { gte: filters.since };
  }
  if (keywords.length === 1) {
    messageWhere.body = { contains: keywords[0], mode: 'insensitive' };
  } else if (keywords.length > 1) {
    messageWhere.AND = keywords.map((kw) => ({
      body: { contains: kw, mode: 'insensitive' as const },
    }));
  }

  const rows = await prisma.integrationMessage.findMany({
    where: messageWhere,
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
