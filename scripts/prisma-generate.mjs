import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.EAS_BUILD === 'true') {
  console.log('[prisma-generate] Skipped on EAS Build (mobile app does not need Prisma).');
  process.exit(0);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseDir = path.join(root, 'packages', 'database');
const generatedDir = path.join(databaseDir, 'generated', 'prisma');
const stagingDir = path.join(databaseDir, 'generated', '.prisma-staging');
const schemaPath = path.join(databaseDir, 'prisma', 'schema.prisma');
const stagingSchemaPath = path.join(databaseDir, 'prisma', '.schema.staging.prisma');

const maxAttempts = 5;
const lenient =
  process.argv.includes('--lenient') ||
  process.env.PRISMA_GENERATE_LENIENT === '1' ||
  process.env.NODE_ENV === 'development';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function queryEngineName() {
  if (process.platform === 'win32') return 'query_engine-windows.dll.node';
  if (process.platform === 'darwin') return 'libquery_engine-darwin.dylib.node';
  return 'libquery_engine-linux.so.node';
}

function clientLooksReady() {
  const indexJs = path.join(generatedDir, 'index.js');
  const indexDts = path.join(generatedDir, 'index.d.ts');
  if (!existsSync(indexJs) || !existsSync(indexDts)) return false;

  if (existsSync(path.join(generatedDir, 'query_engine_bg.wasm'))) return true;

  return existsSync(path.join(generatedDir, queryEngineName()));
}

function writeStagingSchema() {
  const schema = readFileSync(schemaPath, 'utf8');
  const stagingOutput = '../generated/.prisma-staging';
  const next = schema.replace(
    /output\s*=\s*"[^"]+"/,
    `output     = "${stagingOutput}"`
  );
  writeFileSync(stagingSchemaPath, next, 'utf8');
}

function runGenerate(schemaFile = schemaPath) {
  return spawnSync('pnpm', ['exec', 'prisma', 'generate', '--schema', schemaFile], {
    cwd: databaseDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function mergeStagingIntoGenerated() {
  mkdirSync(generatedDir, { recursive: true });

  const entries = readDirRecursive(stagingDir);
  let engineSkipped = false;

  for (const rel of entries) {
    const src = path.join(stagingDir, rel);
    const dest = path.join(generatedDir, rel);
    mkdirSync(path.dirname(dest), { recursive: true });

    try {
      copyFileSync(src, dest);
    } catch (err) {
      const isNativeEngine = rel.endsWith('.node');
      if (isNativeEngine && existsSync(dest)) {
        engineSkipped = true;
        continue;
      }
      throw err;
    }
  }

  return engineSkipped;
}

function readDirRecursive(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const rel = base ? `${base}/${name}` : name;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...readDirRecursive(full, rel));
    } else {
      out.push(rel.replace(/\\/g, '/'));
    }
  }
  return out;
}

function cleanDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* locked — continue */
  }
}

async function generateViaStaging() {
  writeStagingSchema();
  cleanDir(stagingDir);

  const result = runGenerate(stagingSchemaPath);
  if ((result.status ?? 1) !== 0) {
    cleanDir(stagingDir);
    try {
      rmSync(stagingSchemaPath, { force: true });
    } catch {
      /* ignore */
    }
    return result.status ?? 1;
  }

  try {
    const engineSkipped = mergeStagingIntoGenerated();
    if (engineSkipped) {
      console.warn(
        '[prisma-generate] Stale native query_engine DLL was locked and left in place (WASM client is active).'
      );
    }
  } finally {
    cleanDir(stagingDir);
    try {
      rmSync(stagingSchemaPath, { force: true });
    } catch {
      /* ignore */
    }
  }

  return 0;
}

function removeStaleNativeEngineIfWasm() {
  const schema = readFileSync(schemaPath, 'utf8');
  if (!schema.includes('engineType = "wasm"')) return;
  const dll = path.join(generatedDir, queryEngineName());
  if (!existsSync(dll)) return;
  try {
    rmSync(dll, { force: true });
  } catch {
    /* locked by a running process — staging merge will skip engine copy */
  }
}

async function main() {
  removeStaleNativeEngineIfWasm();
  
  if (process.platform === 'win32') {
    const staged = await generateViaStaging();
    if (staged === 0) process.exit(0);
  }

  if (clientLooksReady()) {
    const quick = runGenerate();
    if ((quick.status ?? 1) === 0) {
      process.exit(0);
    }
    console.warn('[prisma-generate] In-place generate failed — trying staging merge...');
    const staged = await generateViaStaging();
    if (staged === 0) process.exit(0);
  }

  let lastStatus = 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) await sleep(400 * attempt);

    lastStatus = await generateViaStaging();
    if (lastStatus === 0) process.exit(0);

    const fallback = runGenerate();
    lastStatus = fallback.status ?? 1;
    if (lastStatus === 0) process.exit(0);

    if (attempt < maxAttempts) {
      console.warn(`[prisma-generate] attempt ${attempt}/${maxAttempts} failed, retrying...`);
    }
  }

  if (lenient && clientLooksReady()) {
    console.warn(
      '[prisma-generate] Generate skipped: query engine locked by a running Node process. Existing client is usable.'
    );
    console.warn('[prisma-generate] Stop API/workers and run `pnpm db:generate` for a clean regenerate.');
    process.exit(0);
  }

  console.error(
    '[prisma-generate] failed after retries. Stop running API/workers, then run: pnpm db:generate'
  );
  process.exit(lastStatus);
}

await main();
