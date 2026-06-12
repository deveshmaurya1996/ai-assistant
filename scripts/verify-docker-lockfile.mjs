import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockfile = path.join(root, 'pnpm-lock.yaml');
const dockerNpmrc = path.join(root, '.docker.npmrc');

const lock = fs.readFileSync(lockfile, 'utf8');
if (lock.includes('injected: true')) {
  console.error(
    'pnpm-lock.yaml contains stale injected metadata (usually from pnpm deploy).\n' +
      'Run `pnpm install`, commit the updated lockfile, then redeploy.',
  );
  process.exit(1);
}

execSync('pnpm install --frozen-lockfile --ignore-scripts', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, npm_config_userconfig: dockerNpmrc },
  shell: process.platform === 'win32',
});

console.log('Docker lockfile check passed.');
