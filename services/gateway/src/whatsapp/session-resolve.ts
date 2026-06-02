import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { prisma, Prisma } from '@ai-assistant/database';
import { getWhatsAppAuthRoot } from './auth-paths';
import { sessionManager } from './session-manager';
import { markConnectionActive } from './connection-lifecycle';

type SessionMeta = {
  sessionId?: string;
  userId?: string;
  status?: string;
  updatedAt?: string;
};

async function readSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  try {
    const raw = await readFile(
      path.join(getWhatsAppAuthRoot(), sessionId, 'session.json'),
      'utf8'
    );
    return JSON.parse(raw) as SessionMeta;
  } catch {
    return null;
  }
}

async function isSessionActive(sessionId: string): Promise<boolean> {
  const inMem = sessionManager.getSession(sessionId);
  if (inMem?.status === 'active') return true;
  const meta = await readSessionMeta(sessionId);
  return meta?.status === 'active';
}

export async function findLatestActiveBridgeSession(userId: string): Promise<string | null> {
  const root = getWhatsAppAuthRoot();
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }

  const prefix = `wa_${userId}_`;
  const candidates: { sessionId: string; updatedAt: number }[] = [];

  for (const ent of entries) {
    if (!ent.isDirectory() || !ent.name.startsWith(prefix)) continue;
    try {
      const meta = await readSessionMeta(ent.name);
      if (meta?.status !== 'active') continue;
      candidates.push({
        sessionId: meta.sessionId ?? ent.name,
        updatedAt: new Date(meta.updatedAt ?? 0).getTime(),
      });
    } catch {
      /* skip invalid dirs */
    }
  }

  candidates.sort((a, b) => b.updatedAt - a.updatedAt);
  return candidates[0]?.sessionId ?? null;
}

export async function repairWhatsAppConnectionMetadata(
  userId: string,
  bridgeSessionId: string
): Promise<void> {
  const connection = await prisma.userConnection.findFirst({
    where: { userId, providerId: 'whatsapp' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!connection) return;

  const meta = (connection.metadata ?? {}) as Record<string, unknown>;
  if (meta.bridgeSessionId === bridgeSessionId) return;

  await prisma.userConnection.update({
    where: { id: connection.id },
    data: {
      metadata: { ...meta, bridgeSessionId } as Prisma.InputJsonValue,
    },
  });
}

async function markActiveIfNeeded(
  userId: string,
  connectionId: string,
  currentStatus: string
): Promise<void> {
  if (currentStatus === 'ACTIVE') return;
  await markConnectionActive({ userId, connectionId, providerId: 'whatsapp' });
}

export async function resolveBridgeSessionForUser(
  userId: string,
  connectionId?: string
): Promise<{ sessionId: string; connectionId: string } | null> {
  const connection = connectionId
    ? await prisma.userConnection.findFirst({
        where: { id: connectionId, userId, providerId: 'whatsapp' },
      })
    : await prisma.userConnection.findFirst({
        where: { userId, providerId: 'whatsapp' },
        orderBy: { updatedAt: 'desc' },
      });

  if (!connection) return null;

  const meta = (connection.metadata ?? {}) as { bridgeSessionId?: string };
  const fromDb = meta.bridgeSessionId?.trim() || null;

  if (fromDb && (await isSessionActive(fromDb))) {
    await markActiveIfNeeded(userId, connection.id, connection.status);
    return { sessionId: fromDb, connectionId: connection.id };
  }

  const fromDisk = await findLatestActiveBridgeSession(userId);
  if (fromDisk) {
    await repairWhatsAppConnectionMetadata(userId, fromDisk);
    await markActiveIfNeeded(userId, connection.id, connection.status);
    return { sessionId: fromDisk, connectionId: connection.id };
  }

  return null;
}
