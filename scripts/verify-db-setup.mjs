/**
 * Verifies Prisma client + migrations match schema (same steps as Tilt db-setup).
 * Usage: node scripts/verify-db-setup.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedTypes = path.join(
  root,
  'packages',
  'database',
  'generated',
  'prisma',
  'index.d.ts'
);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  return r.status ?? 1;
}

const steps = [
  ['node', ['scripts/with-env.mjs', 'node', 'scripts/dev.mjs', 'db-setup']],
];

for (const [cmd, args] of steps) {
  const code = run(cmd, args);
  if (code !== 0) {
    console.error('[verify-db-setup] FAILED');
    process.exit(code);
  }
}

if (!existsSync(generatedTypes)) {
  console.error('[verify-db-setup] Missing generated Prisma client:', generatedTypes);
  process.exit(1);
}

const types = readFileSync(generatedTypes, 'utf8');
for (const model of ['chatThread', 'integrationMessage']) {
  if (!types.includes(model)) {
    console.error(`[verify-db-setup] Generated client missing prisma.${model}`);
    process.exit(1);
  }
}

console.log('[verify-db-setup] OK — client has ChatThread + IntegrationMessage, migrations applied');
