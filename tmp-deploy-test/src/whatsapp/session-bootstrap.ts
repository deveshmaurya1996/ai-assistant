import { readdir } from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import { getWhatsAppAuthRoot } from './auth-paths';
import { ensureAuthDirLocal, listRemoteSessionIds, usesRemoteWhatsAppAuth } from './auth-remote';
import { sessionManager } from './session-manager';

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

export async function bootstrapWhatsAppSessions(): Promise<void> {
  const sessionIds = usesRemoteWhatsAppAuth()
    ? await listRemoteSessionIds()
    : await listLocalSessionIds();

  const root = getWhatsAppAuthRoot();
  const activeSessionIds: string[] = [];
  for (const sessionId of sessionIds) {
    if (!sessionId.startsWith('wa_')) continue;
    try {
      await ensureAuthDirLocal(sessionId, path.join(root, sessionId));
      const session = await sessionManager.getOrRestoreSession(sessionId);
      if (session.status === 'active') {
        activeSessionIds.push(sessionId);
      }
    } catch (err) {
      logger.warn({ err, sessionId }, 'WhatsApp bootstrap skip');
    }
  }

  if (activeSessionIds.length > 0) {
    logger.info({ count: activeSessionIds.length }, 'WhatsApp sessions bootstrapped');
  }
}
