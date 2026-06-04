#!/usr/bin/env node
/**
 * Smoke test: upload → index → status ready.
 * Usage: node scripts/with-env.mjs node scripts/verify-file-pipeline.mjs [--token JWT]
 */
import fs from 'node:fs';
import path from 'node:path';

const gateway = process.argv.includes('--gateway')
  ? process.argv[process.argv.indexOf('--gateway') + 1]
  : process.env.API_PUBLIC_URL ??
    process.env.GATEWAY_URL ??
    process.env.API_URL ??
    `http://localhost:${process.env.API_PORT || 3000}`;

const tokenIdx = process.argv.indexOf('--token');
const token = tokenIdx >= 0 ? process.argv[tokenIdx + 1] : process.env.VERIFY_FILE_TOKEN;

if (!token) {
  console.error('Set VERIFY_FILE_TOKEN or pass --token <jwt>');
  process.exit(1);
}

const samplePath = path.join(process.cwd(), 'services', 'ai-runtime', 'docs', 'ARCHITECTURE.md');
const fallback = path.join(process.cwd(), 'README.md');
const filePath = fs.existsSync(samplePath) ? samplePath : fallback;
const buffer = fs.readFileSync(filePath);
const filename = path.basename(filePath);

const headers = { Authorization: `Bearer ${token}` };

async function main() {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'text/markdown' }), filename);

  const uploadRes = await fetch(`${gateway}/files/upload`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!uploadRes.ok) {
    console.error('Upload failed', uploadRes.status, await uploadRes.text());
    process.exit(1);
  }
  const uploaded = await uploadRes.json();
  console.log('Uploaded', uploaded.id, 'status=', uploaded.status);

  const maxWait = 90_000;
  const start = Date.now();
  let status = uploaded.status;

  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(`${gateway}/files/${uploaded.id}/status`, { headers });
    if (!statusRes.ok) {
      console.warn('Status poll failed', statusRes.status);
      continue;
    }
    const meta = await statusRes.json();
    status = meta.status;
    console.log('Poll', { status, chunkCount: meta.chunkCount, indexedAt: meta.indexedAt });
    if (status === 'ready') {
      console.log('Pipeline OK', meta);
      process.exit(0);
    }
    if (status === 'failed') {
      console.error('Indexing failed', meta);
      process.exit(1);
    }
  }

  console.error('Timed out waiting for ready', { fileId: uploaded.id, lastStatus: status });
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
