import { prisma } from '@ai-assistant/database';
import type { CachedMessage } from './session-manager';

/** Background persistence for WhatsApp messages (Phase 3). Never blocks live reads. */
export async function syncWhatsAppMessage(
  sessionId: string,
  jid: string,
  message: CachedMessage,
  displayName?: string
): Promise<void> {
  try {
    const connection = await prisma.userConnection.findFirst({
      where: {
        providerId: 'whatsapp',
        status: 'ACTIVE',
        metadata: {
          path: ['bridgeSessionId'],
          equals: sessionId,
        },
      },
    });
    if (!connection) return;

    const thread = await prisma.chatThread.upsert({
      where: {
        connectionId_externalJid: {
          connectionId: connection.id,
          externalJid: jid,
        },
      },
      create: {
        userId: connection.userId,
        connectionId: connection.id,
        provider: 'whatsapp',
        externalJid: jid,
        displayName: displayName ?? message.pushName ?? jid.split('@')[0],
        lastMessageAt: new Date(message.timestamp),
      },
      update: {
        displayName: displayName ?? undefined,
        lastMessageAt: new Date(message.timestamp),
        updatedAt: new Date(),
      },
    });

    await prisma.integrationMessage.upsert({
      where: {
        threadId_externalId: {
          threadId: thread.id,
          externalId: message.id,
        },
      },
      create: {
        threadId: thread.id,
        externalId: message.id,
        direction: message.fromMe ? 'outbound' : 'inbound',
        body: message.body,
        sentAt: new Date(message.timestamp),
      },
      update: {
        body: message.body,
        sentAt: new Date(message.timestamp),
      },
    });
  } catch (err) {
    console.warn('[whatsapp-sync] persist failed:', err);
  }
}
