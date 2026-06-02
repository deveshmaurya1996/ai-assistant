#!/usr/bin/env node
/**
 * One-time: upload local FileAsset blobs to R2 and update storageKey/storageBackend.
 * Requires R2_* env and STORAGE_BACKEND=r2. Skips rows already on r2 backend.
 *
 * Usage: node scripts/with-env.mjs node scripts/migrate-local-files-to-r2.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { prisma } = await import('@ai-assistant/database');
  const { getFileStorage, loadStorageConfig, buildUserFileKey } = await import(
    '@ai-assistant/storage'
  );

  const config = loadStorageConfig();
  const remote = getFileStorage();
  const localRoot = config.localRoot;

  if (remote.backend !== 'r2') {
    console.error('R2 not configured (set R2_BUCKET_NAME + keys). Aborting.');
    process.exit(1);
  }

  const assets = await prisma.fileAsset.findMany({
    where: { storageBackend: { not: 'r2' } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${assets.length} file(s) to migrate${dryRun ? ' (dry run)' : ''}`);

  for (const asset of assets) {
    const localPath = path.join(localRoot, asset.storageKey);
    if (!fs.existsSync(localPath)) {
      console.warn('Skip missing local file', asset.id, localPath);
      continue;
    }

    const bytes = fs.readFileSync(localPath);
    const key = buildUserFileKey(asset.userId, asset.id, asset.filename);

    if (dryRun) {
      console.log('Would migrate', asset.id, '→', key);
      continue;
    }

    await remote.putObject({
      key,
      body: bytes,
      contentType: asset.mimeType,
    });

    await prisma.fileAsset.update({
      where: { id: asset.id },
      data: {
        storageKey: key,
        storageBackend: 'r2',
      },
    });

    console.log('Migrated', asset.id);
  }

  console.log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
