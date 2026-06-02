import path from 'node:path';

export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-()+ ]/g, '_');
  return base.length > 0 ? base.slice(0, 200) : 'file';
}

export function buildUserFileKey(
  userId: string,
  fileId: string,
  filename: string
): string {
  const safeName = sanitizeFilename(filename);
  return path.posix.join('users', userId, 'files', `${fileId}_${safeName}`);
}
