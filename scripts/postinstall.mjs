
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlanner } from './validate-planner.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd) {
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

if (process.env.EAS_BUILD === 'true') {
  run('pnpm --filter @ai-assistant/types build && pnpm --filter @ai-assistant/sdk build');
  process.exit(0);
}

if (process.env.SKIP_DEV_BOOTSTRAP === '1') {
  console.log('[postinstall] SKIP_DEV_BOOTSTRAP=1 — skipping workspace build');
  process.exit(0);
}

console.log('[postinstall] ensuring env files from examples...');
run('node scripts/env-setup.mjs');

console.log('[postinstall] building workspace packages...');
run('pnpm build');

validatePlanner();
