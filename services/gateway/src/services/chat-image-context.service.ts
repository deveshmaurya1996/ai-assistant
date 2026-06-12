import { prisma } from '@ai-assistant/database';
import type { ChatAttachmentRef } from '@ai-assistant/types';

function attachmentsFromMetadata(metadata: unknown): ChatAttachmentRef[] | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = (metadata as { attachments?: unknown }).attachments;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw as ChatAttachmentRef[];
}

export async function findLatestAssistantImageAttachment(
  sessionId: string
): Promise<ChatAttachmentRef | null> {
  const rows = await prisma.message.findMany({
    where: { chatSessionId: sessionId, role: 'ASSISTANT' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { metadata: true },
  });
  for (const row of rows) {
    const atts = attachmentsFromMetadata(row.metadata ?? null);
    const image = atts?.find((a) => a.kind === 'image');
    if (image) return image;
  }
  return null;
}
