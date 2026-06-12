import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma, Prisma } from '@ai-assistant/database';
import type { CachedMessage, ChatEntry, UnreadChatItem } from './session-manager';
import { getWhatsAppAuthRoot } from './auth-paths';
import { ensureAuthDirLocal } from './auth-remote';

async function readSessionUserId(sessionId: string): Promise<string | null> {
  const authDir = path.join(getWhatsAppAuthRoot(), sessionId);
  try {
    await ensureAuthDirLocal(sessionId, authDir);
    const raw = await readFile(path.join(authDir, 'session.json'), 'utf8');
    return (JSON.parse(raw) as { userId?: string }).userId ?? null;
  } catch {
    return null;
  }
}

export async function resolveConnectionBySession(sessionId: string) {
  const byBridge = await prisma.userConnection.findFirst({
    where: {
      providerId: 'whatsapp',
      metadata: {
        path: ['bridgeSessionId'],
        equals: sessionId,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (byBridge) return byBridge;

  const userId = await readSessionUserId(sessionId);
  if (!userId) return null;

  const connection = await prisma.userConnection.findFirst({
    where: { userId, providerId: 'whatsapp' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!connection) return null;

  const meta = (connection.metadata ?? {}) as Record<string, unknown>;
  if (meta.bridgeSessionId !== sessionId) {
    await prisma.userConnection
      .update({
        where: { id: connection.id },
        data: {
          metadata: { ...meta, bridgeSessionId: sessionId } as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
  }
  return connection;
}
 
export async function syncWhatsAppChatsBatch(
  sessionId: string,
  chats: Array<{ jid: string; name: string; unreadCount?: number; lastMessageAt?: Date }>
): Promise<void> {
  if (chats.length === 0) return;
  try {
    const connection = await resolveConnectionBySession(sessionId);
    if (!connection) return;

    await Promise.all(
      chats.map((chat) =>
        prisma.chatThread.upsert({
          where: {
            connectionId_externalJid: {
              connectionId: connection.id,
              externalJid: chat.jid,
            },
          },
          create: {
            userId: connection.userId,
            connectionId: connection.id,
            provider: 'whatsapp',
            externalJid: chat.jid,
            displayName: chat.name,
            unreadCount: chat.unreadCount ?? 0,
            lastMessageAt: chat.lastMessageAt ?? new Date(),
          },
          update: {
            displayName: chat.name,
            ...(typeof chat.unreadCount === 'number' ? { unreadCount: chat.unreadCount } : {}),
            ...(chat.lastMessageAt ? { lastMessageAt: chat.lastMessageAt } : {}),
            updatedAt: new Date(),
          },
        })
      )
    );
  } catch (err) {
    console.warn('[whatsapp-sync] chat batch persist failed:', err);
  }
}

export async function syncWhatsAppMessage(
  sessionId: string,
  jid: string,
  message: CachedMessage,
  displayName?: string,
  unreadCount?: number
): Promise<void> {
  try {
    const connection = await resolveConnectionBySession(sessionId);
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
        unreadCount:
          typeof unreadCount === 'number' ? unreadCount : message.fromMe ? 0 : 1,
      },
      update: {
        displayName: displayName ?? undefined,
        lastMessageAt: new Date(message.timestamp),
        updatedAt: new Date(),
        ...(typeof unreadCount === 'number'
          ? { unreadCount }
          : message.fromMe
            ? {}
            : { unreadCount: { increment: 1 } }),
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

/** History sync batch — never inflates unread counts for old messages. */
export async function syncWhatsAppHistoryMessages(
  sessionId: string,
  entries: Array<{ jid: string; message: CachedMessage; displayName?: string }>
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const connection = await resolveConnectionBySession(sessionId);
    if (!connection) return;

    for (const entry of entries) {
      const { jid, message, displayName } = entry;
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
          unreadCount: 0,
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
    }
  } catch (err) {
    console.warn('[whatsapp-sync] history batch persist failed:', err);
  }
}

export async function countSyncedThreads(sessionId: string): Promise<number> {
  const connection = await resolveConnectionBySession(sessionId);
  if (!connection) return 0;
  return prisma.chatThread.count({ where: { connectionId: connection.id } });
}

export async function loadChatsFromDb(sessionId: string, limit = 1000): Promise<ChatEntry[]> {
  const connection = await resolveConnectionBySession(sessionId);
  if (!connection) return [];

  const threads = await prisma.chatThread.findMany({
    where: { connectionId: connection.id },
    orderBy: { lastMessageAt: 'desc' },
    take: limit,
  });

  return threads.map((thread) => ({
    jid: thread.externalJid,
    name: thread.displayName ?? thread.externalJid.split('@')[0] ?? thread.externalJid,
    unreadCount: thread.unreadCount,
  }));
}

export async function loadMessagesFromDb(
  sessionId: string,
  jid: string,
  limit: number
): Promise<CachedMessage[]> {
  const connection = await resolveConnectionBySession(sessionId);
  if (!connection) return [];

  const thread = await prisma.chatThread.findFirst({
    where: { connectionId: connection.id, externalJid: jid },
    include: {
      messages: { orderBy: { sentAt: 'desc' }, take: limit },
    },
  });
  if (!thread) return [];

  return thread.messages
    .map((m) => ({
      id: m.externalId,
      jid,
      fromMe: m.direction === 'outbound',
      body: m.body ?? '',
      timestamp: m.sentAt.toISOString(),
    }))
    .reverse();
}

export async function loadUnreadFromDb(
  sessionId: string,
  limit: number
): Promise<UnreadChatItem[]> {
  const connection = await resolveConnectionBySession(sessionId);
  if (!connection) return [];

  const threads = await prisma.chatThread.findMany({
    where: { connectionId: connection.id, unreadCount: { gt: 0 } },
    orderBy: { lastMessageAt: 'desc' },
    take: limit,
    include: {
      messages: { orderBy: { sentAt: 'desc' }, take: 1 },
    },
  });

  return threads.map((thread) => ({
    chatId: thread.externalJid,
    sender: thread.displayName ?? thread.externalJid.split('@')[0] ?? 'Chat',
    preview: (thread.messages[0]?.body ?? '').slice(0, 500) || '(no preview)',
    timestamp: thread.lastMessageAt?.toISOString() ?? new Date().toISOString(),
    unreadCount: thread.unreadCount,
  }));
}

/** Preload recent messages for top chats into memory after DB hydrate. */
export async function preloadRecentMessages(
  sessionId: string,
  jids: string[],
  perChat = 25
): Promise<Map<string, CachedMessage[]>> {
  const out = new Map<string, CachedMessage[]>();
  await Promise.all(
    jids.slice(0, 30).map(async (jid) => {
      const msgs = await loadMessagesFromDb(sessionId, jid, perChat);
      if (msgs.length > 0) out.set(jid, msgs);
    })
  );
  return out;
}
