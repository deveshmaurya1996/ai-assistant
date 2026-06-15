import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { prisma, Prisma } from '@ai-assistant/database';
import { getWhatsAppAuthRoot } from './auth-paths';
import { ensureAuthDirLocal, listRemoteSessionIds, usesRemoteWhatsAppAuth } from './auth-remote';
import { sessionManager } from './session-manager';
import { markConnectionActive, markWhatsAppDisconnectedForUser } from './connection-lifecycle';

type SessionMeta = {
  sessionId?: string;
  userId?: string;
  status?: string;
  updatedAt?: string;
};

async function readSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const authDir = path.join(getWhatsAppAuthRoot(), sessionId);
  try {
    await ensureAuthDirLocal(sessionId, authDir);
    const raw = await readFile(path.join(authDir, 'session.json'), 'utf8');
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

async function hasRegisteredCredentials(sessionId: string): Promise<boolean> {
  const authDir = path.join(getWhatsAppAuthRoot(), sessionId);
  try {
    await ensureAuthDirLocal(sessionId, authDir);
    const raw = await readFile(path.join(authDir, 'creds.json'), 'utf8');
    const creds = JSON.parse(raw) as { registered?: boolean };
    return creds.registered === true;
  } catch {
    return false;
  }
}

async function ensureSessionUsable(sessionId: string): Promise<boolean> {
  if (await isSessionActive(sessionId)) {
    return sessionManager.bootstrapActiveSession(sessionId);
  }
  if (await hasRegisteredCredentials(sessionId)) {
    return sessionManager.tryRestoreStoredSession(sessionId);
  }
  return false;
}

async function listBridgeSessionIdsForUser(userId: string): Promise<string[]> {
  const prefix = `wa_${userId}_`;
  if (usesRemoteWhatsAppAuth()) {
    return (await listRemoteSessionIds()).filter((id) => id.startsWith(prefix));
  }
  const root = getWhatsAppAuthRoot();
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((ent) => ent.isDirectory() && ent.name.startsWith(prefix))
      .map((ent) => ent.name);
  } catch {
    return [];
  }
}

export async function findLatestActiveBridgeSession(userId: string): Promise<string | null> {
  const sessionIds = await listBridgeSessionIdsForUser(userId);
  const candidates: { sessionId: string; updatedAt: number }[] = [];

  for (const sessionId of sessionIds) {
    try {
      const meta = await readSessionMeta(sessionId);
      if (meta?.status !== 'active') continue;
      candidates.push({
        sessionId: meta.sessionId ?? sessionId,
        updatedAt: new Date(meta.updatedAt ?? 0).getTime(),
      });
    } catch {
      /* skip invalid dirs */
    }
  }

  candidates.sort((a, b) => b.updatedAt - a.updatedAt);
  return candidates[0]?.sessionId ?? null;
}

export async function findLatestRecoverableBridgeSession(userId: string): Promise<string | null> {
  const sessionIds = await listBridgeSessionIdsForUser(userId);
  const candidates: { sessionId: string; updatedAt: number; priority: number }[] = [];

  for (const sessionId of sessionIds) {
    try {
      const meta = await readSessionMeta(sessionId);
      if (!meta) continue;
      const resolvedId = meta.sessionId ?? sessionId;
      const updatedAt = new Date(meta.updatedAt ?? 0).getTime();
      if (meta.status === 'active') {
        candidates.push({ sessionId: resolvedId, updatedAt, priority: 2 });
        continue;
      }
      if (meta.status === 'disconnected' && (await hasRegisteredCredentials(sessionId))) {
        candidates.push({ sessionId: resolvedId, updatedAt, priority: 1 });
      }
    } catch {
      /* skip invalid dirs */
    }
  }

  candidates.sort((a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt);
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

  if (fromDb && (await ensureSessionUsable(fromDb))) {
    await repairWhatsAppConnectionMetadata(userId, fromDb);
    await markActiveIfNeeded(userId, connection.id, connection.status);
    return { sessionId: fromDb, connectionId: connection.id };
  }

  const fromDisk = await findLatestRecoverableBridgeSession(userId);
  if (fromDisk && (await ensureSessionUsable(fromDisk))) {
    await repairWhatsAppConnectionMetadata(userId, fromDisk);
    await markActiveIfNeeded(userId, connection.id, connection.status);
    return { sessionId: fromDisk, connectionId: connection.id };
  }

  if (connection.status === 'ACTIVE' && !fromDisk) {
    await markWhatsAppDisconnectedForUser(userId);
  }

  return null;
}
