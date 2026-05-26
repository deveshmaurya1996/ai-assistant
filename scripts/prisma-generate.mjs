import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseDir = path.join(root, 'packages', 'database');
const generatedDir = path.join(databaseDir, 'generated', 'prisma');
const prismaClientDir = path.join(root, 'node_modules', '.prisma', 'client');
const queryEnginePath = path.join(
  prismaClientDir,
  process.platform === 'win32'
    ? 'query_engine-windows.dll.node'
    : process.platform === 'darwin'
      ? 'libquery_engine-darwin.dylib.node'
      : 'libquery_engine-linux.so.node'
);
const maxAttempts = 5;
const lenient =
  process.argv.includes('--lenient') ||
  process.env.PRISMA_GENERATE_LENIENT === '1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runGenerate() {
  return spawnSync('pnpm', ['exec', 'prisma', 'generate'], {
    cwd: databaseDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function clientLooksReady() {
  return existsSync(queryEnginePath);
}

function cleanOutputs() {
  for (const dir of [generatedDir, prismaClientDir]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* locked — retry anyway */
    }
  }
}

async function main() {
  let lastStatus = 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      cleanOutputs();
      await sleep(400 * attempt);
    }

    const result = runGenerate();
    lastStatus = result.status ?? 1;

    if (lastStatus === 0) {
      process.exit(0);
    }

    if (attempt < maxAttempts) {
      console.warn(
        `[prisma-generate] attempt ${attempt}/${maxAttempts} failed, retrying...`
      );
    }
  }

  if (lenient && clientLooksReady()) {
    console.warn(
      '[prisma-generate] generate skipped: query engine is locked by a running Node process (API/worker). Existing Prisma client is still usable.'
    );
    console.warn(
      '[prisma-generate] Stop the API and run `pnpm db:generate` when you need a fresh client.'
    );
    process.exit(0);
  }

  console.error(
    '[prisma-generate] failed after retries. Stop running API/workers and close editors locking node_modules/.prisma, then run: pnpm db:generate'
  );
  process.exit(lastStatus);
}

await main();
