import { prisma } from '@ai-assistant/database';
import { chatHistoryLimit } from './chat.service';

export function toChronologicalOrder<T>(newestFirst: T[]): T[] {
  return newestFirst.slice().reverse();
}

export async function loadRecentChatHistory(
  chatSessionId: string,
  limit?: number
) {
  const take = limit ?? chatHistoryLimit();
  const rows = await prisma.message.findMany({
    where: { chatSessionId },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return toChronologicalOrder(rows);
}
