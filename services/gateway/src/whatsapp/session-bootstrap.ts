import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import { getWhatsAppAuthRoot } from './auth-paths';
import { ensureAuthDirLocal, listRemoteSessionIds, usesRemoteWhatsAppAuth } from './auth-remote';
import { sessionManager, type SessionStatus } from './session-manager';

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? 'warn' });

async function listLocalSessionIds(): Promise<string[]> {
  const root = getWhatsAppAuthRoot();
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && e.name.startsWith('wa_')).map((e) => e.name);
  } catch {
    return [];
  }
}

async function readSessionStatus(sessionId: string): Promise<SessionStatus | null> {
  const root = getWhatsAppAuthRoot();
  const authDir = path.join(root, sessionId);
  try {
    await ensureAuthDirLocal(sessionId, authDir);
    const raw = await readFile(path.join(authDir, 'session.json'), 'utf8');
    const saved = JSON.parse(raw) as { status?: SessionStatus };
    return saved.status ?? null;
  } catch {
    return null;
  }
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
}

export async function bootstrapWhatsAppSessions(): Promise<void> {
  if (isProductionRuntime() && !usesRemoteWhatsAppAuth()) {
    logger.info('WhatsApp bootstrap skipped — configure R2 auth storage for production');
    return;
  }

  const sessionIds = usesRemoteWhatsAppAuth()
    ? await listRemoteSessionIds()
    : await listLocalSessionIds();

  let activeOnDisk = 0;
  let pendingOnDisk = 0;
  let disconnectedOnDisk = 0;
  const activeSessionIds: string[] = [];

  for (const sessionId of sessionIds) {
    if (!sessionId.startsWith('wa_')) continue;
    const status = await readSessionStatus(sessionId);
    if (status === 'active') activeOnDisk += 1;
    else if (status === 'pending') pendingOnDisk += 1;
    else if (status === 'disconnected') disconnectedOnDisk += 1;

    if (status !== 'active') continue;

    const restored = await sessionManager.bootstrapActiveSession(sessionId);
    if (restored) {
      activeSessionIds.push(sessionId);
    }
  }

  if (activeSessionIds.length > 0) {
    logger.info({ count: activeSessionIds.length }, 'WhatsApp sessions bootstrapped');
  } else if (sessionIds.length > 0) {
    logger.info(
      { total: sessionIds.length, activeOnDisk, pendingOnDisk, disconnectedOnDisk },
      'WhatsApp bootstrap skipped non-active sessions'
    );
  }
}
