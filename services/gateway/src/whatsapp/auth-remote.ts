import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getFileStorage } from '@ai-assistant/storage';

const WA_AUTH_ROOT_PREFIX = 'wa-auth';

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

export async function pushAuthDirToRemote(sessionId: string, localDir: string): Promise<void> {
  if (!usesRemoteWhatsAppAuth()) return;

  let entries;
  try {
    entries = await readdir(localDir, { withFileTypes: true });
  } catch {
    return;
  }

  const storage = getFileStorage();
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const body = await readFile(path.join(localDir, ent.name));
    await storage.putObject({
      key: waAuthObjectKey(sessionId, ent.name),
      body,
      contentType: contentTypeFor(ent.name),
    });
  }
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
