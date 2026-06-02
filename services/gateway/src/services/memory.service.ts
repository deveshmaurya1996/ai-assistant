import { prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { fetchAi } from '../lib/http';

export async function ingestConversationMemory(
  userId: string,
  userText: string,
  assistantText: string
) {
  const content = `User: ${userText}\nAssistant: ${assistantText}`;

  await fetchAi('/v1/memory/ingest', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      documents: [{ text: content, metadata: { type: 'conversation' } }],
    }),
  });

  const item = await prisma.memoryItem.create({
    data: {
      userId,
      type: 'CONVERSATION',
      content,
      metadata: { source: 'chat' },
    },
  });

  await publishEvent(EventNames.MEMORY_SAVED, {
    userId,
    memoryItemId: item.id,
    type: 'CONVERSATION',
  }).catch(() => undefined);
}
