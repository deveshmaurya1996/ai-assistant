import { prisma } from '@ai-assistant/database';
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

  await prisma.memoryItem.create({
    data: {
      userId,
      type: 'CONVERSATION',
      content,
      metadata: { source: 'chat' },
    },
  });
}
