import { readdir } from 'node:fs/promises';
import pino from 'pino';
import { getWhatsAppAuthRoot } from './auth-paths';
import { sessionManager } from './session-manager';

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? 'warn' });

export async function bootstrapWhatsAppSessions(): Promise<void> {
  const root = getWhatsAppAuthRoot();
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  const activeSessionIds: string[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory() || !ent.name.startsWith('wa_')) continue;
    try {
      const session = await sessionManager.getOrRestoreSession(ent.name);
      if (session.status === 'active') {
        activeSessionIds.push(ent.name);
      }
    } catch (err) {
      logger.warn({ err, sessionId: ent.name }, 'WhatsApp bootstrap skip');
    }
  }

  if (activeSessionIds.length > 0) {
    logger.info({ count: activeSessionIds.length }, 'WhatsApp sessions bootstrapped');
  }
}
