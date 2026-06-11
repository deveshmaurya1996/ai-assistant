import { access, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import { getFileStorage } from '@ai-assistant/storage';

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? 'warn' });

const WA_AUTH_ROOT_PREFIX = 'wa-auth';

const authQueues = new Map<string, Promise<void>>();

export function usesRemoteWhatsAppAuth(): boolean {
  return getFileStorage().backend === 'r2';
}

export function waAuthObjectKey(sessionId: string, filename: string): string {
  return `${WA_AUTH_ROOT_PREFIX}/${sessionId}/${filename}`;
}

export function waAuthPrefix(sessionId: string): string {
  return `${WA_AUTH_ROOT_PREFIX}/${sessionId}/`;
}

function contentTypeFor(filename: string): string {
  return filename.endsWith('.json') ? 'application/json' : 'application/octet-stream';
}

function isIgnorableFsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

async function enqueueAuthPersistence(
  sessionId: string,
  op: () => Promise<void>
): Promise<void> {
  const prev = authQueues.get(sessionId) ?? Promise.resolve();
  const job = prev.catch(() => undefined).then(op);
  authQueues.set(sessionId, job);
  try {
    await job;
  } catch (err) {
    logger.warn({ err, sessionId }, 'WhatsApp auth persistence operation failed');
  } finally {
    if (authQueues.get(sessionId) === job) {
      authQueues.delete(sessionId);
    }
  }
}

export async function drainAuthPersistence(sessionId: string): Promise<void> {
  await enqueueAuthPersistence(sessionId, async () => undefined);
}

async function clearRemoteAuthDirInner(sessionId: string): Promise<void> {
  if (!usesRemoteWhatsAppAuth()) return;
  const storage = getFileStorage();
  const prefix = waAuthPrefix(sessionId);
  const remoteKeys = await storage.listObjectKeys(prefix);
  await Promise.all(
    remoteKeys.map((key) => storage.deleteObject(key).catch(() => undefined))
  );
}

async function pushAuthDirToRemoteInner(sessionId: string, localDir: string): Promise<void> {
  if (!usesRemoteWhatsAppAuth()) return;

  let entries;
  try {
    entries = await readdir(localDir, { withFileTypes: true });
  } catch (err) {
    if (isIgnorableFsError(err)) return;
    throw err;
  }

  const storage = getFileStorage();
  const localFiles = new Set<string>();

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    localFiles.add(ent.name);
    const filePath = path.join(localDir, ent.name);
    let body: Buffer;
    try {
      body = await readFile(filePath);
    } catch (err) {
      if (isIgnorableFsError(err)) continue;
      throw err;
    }
    await storage.putObject({
      key: waAuthObjectKey(sessionId, ent.name),
      body,
      contentType: contentTypeFor(ent.name),
    });
  }

  const prefix = waAuthPrefix(sessionId);
  const remoteKeys = await storage.listObjectKeys(prefix);
  await Promise.all(
    remoteKeys.map(async (key) => {
      const filename = key.slice(prefix.length);
      if (!filename || filename.includes('..') || filename.includes('/')) return;
      if (localFiles.has(filename)) return;
      await storage.deleteObject(key).catch(() => undefined);
    })
  );
}

export async function pushAuthDirToRemote(sessionId: string, localDir: string): Promise<void> {
  await enqueueAuthPersistence(sessionId, () => pushAuthDirToRemoteInner(sessionId, localDir));
}

export async function resetLinkingAuthStore(sessionId: string, localDir: string): Promise<void> {
  await enqueueAuthPersistence(sessionId, async () => {
    await mkdir(localDir, { recursive: true });

    let files: string[];
    try {
      files = await readdir(localDir);
    } catch (err) {
      if (isIgnorableFsError(err)) files = [];
      else throw err;
    }

    await Promise.all(
      files
        .filter((file) => file !== 'session.json')
        .map((file) => unlink(path.join(localDir, file)).catch(() => undefined))
    );

    await clearRemoteAuthDirInner(sessionId);
    await pushAuthDirToRemoteInner(sessionId, localDir);
  });
}

export async function persistBaileysCredentials(
  sessionId: string,
  localDir: string,
  saveCreds: () => Promise<void>,
  isStillValid: () => boolean
): Promise<void> {
  await enqueueAuthPersistence(sessionId, async () => {
    if (!isStillValid()) return;
    await saveCreds();
    if (!isStillValid()) return;
    await pushAuthDirToRemoteInner(sessionId, localDir);
  });
}

export async function remoteAuthExists(sessionId: string): Promise<boolean> {
  if (!usesRemoteWhatsAppAuth()) return false;
  try {
    await getFileStorage().getObject(waAuthObjectKey(sessionId, 'creds.json'));
    return true;
  } catch {
    return false;
  }
}

export async function listRemoteSessionIds(): Promise<string[]> {
  if (!usesRemoteWhatsAppAuth()) return [];
  const keys = await getFileStorage().listObjectKeys(`${WA_AUTH_ROOT_PREFIX}/`);
  const ids = new Set<string>();
  for (const key of keys) {
    const match = key.match(/^wa-auth\/([^/]+)\//);
    if (match?.[1]) ids.add(match[1]);
  }
  return [...ids];
}

export async function pullAuthDirFromRemote(
  sessionId: string,
  localDir: string
): Promise<boolean> {
  if (!usesRemoteWhatsAppAuth()) return false;

  const prefix = waAuthPrefix(sessionId);
  const keys = await getFileStorage().listObjectKeys(prefix);
  if (keys.length === 0) return false;

  await mkdir(localDir, { recursive: true });
  for (const key of keys) {
    const filename = key.slice(prefix.length);
    if (!filename || filename.includes('..') || filename.includes('/')) continue;
    const body = await getFileStorage().getObject(key);
    await writeFile(path.join(localDir, filename), body);
  }
  return true;
}

export async function ensureAuthDirLocal(sessionId: string, localDir: string): Promise<void> {
  try {
    await access(localDir);
    return;
  } catch {
    /* pull from remote */
  }
  await pullAuthDirFromRemote(sessionId, localDir);
}

export async function authDirExists(sessionId: string, localDir: string): Promise<boolean> {
  try {
    await access(localDir);
    return true;
  } catch {
    return remoteAuthExists(sessionId);
  }
}
