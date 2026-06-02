import path from 'node:path';
import type { StorageConfig } from './types';

function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

export function loadStorageConfig(): StorageConfig {
  const localRoot = path.resolve(
    env('UPLOAD_DIR') ?? path.join(process.cwd(), 'data', 'uploads')
  );

  const bucket = env('R2_BUCKET_NAME');
  const accountId = env('R2_ACCOUNT_ID');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');

  const explicit = env('STORAGE_BACKEND');
  const useR2 =
    explicit === 'r2' ||
    (explicit !== 'local' &&
      Boolean(bucket && accountId && accessKeyId && secretAccessKey));

  if (useR2 && bucket && accountId && accessKeyId && secretAccessKey) {
    const endpoint =
      env('R2_ENDPOINT') ??
      `https://${accountId}.r2.cloudflarestorage.com`;
    return {
      backend: 'r2',
      localRoot,
      r2: {
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket,
        endpoint,
      },
    };
  }

  return { backend: 'local', localRoot };
}
