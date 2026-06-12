import { prisma, Role } from '@ai-assistant/database';

export function chatHistoryLimit(): number {
  const raw = process.env.CHAT_HISTORY_LIMIT ?? '20';
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 20;
}

export function toAiRole(role: Role): string {
  if (role === 'USER') return 'user';
  if (role === 'ASSISTANT') return 'assistant';
  return 'system';
}

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
