import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dockerNpmrc = path.join(root, '.docker.npmrc');
const dockerEnv = {
  ...process.env,
  npm_config_userconfig: dockerNpmrc,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    'postgresql://build:build@localhost:5432/build?schema=public',
};

function run(cmd, opts = {}) {
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    env: dockerEnv,
    shell: process.platform === 'win32',
    ...opts,
  });
}

function checkPath(relPath, label) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing ${label}: ${relPath}`);
  }
}

function checkLockfile() {
  const lock = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
  if (lock.includes('injected: true')) {
    throw new Error(
      'pnpm-lock.yaml has stale injected metadata. Run `pnpm install` and commit the lockfile.',
    );
  }
  console.log('[verify:docker] lockfile OK');
}

function auditDockerfileCopySources() {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const required = new Set([
    '.docker.npmrc',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'packages/catalog-codegen/scripts/generate.mjs',
    'packages/database/scripts/prisma-generate.mjs',
    'connectors',
    'catalog',
    'planner-config',
    'infra/supervisor/supervisord.conf',
    'services/ai-runtime/requirements.txt',
    'services/ai-runtime',
  ]);

  for (const line of dockerfile.split('\n')) {
    const match = line.match(/^COPY\s+(?!--from=)(\S+)/);
    if (!match) continue;
    const source = match[1];
    if (source === '.') continue;
    required.add(source.replace(/\/$/, ''));
  }

  for (const rel of required) {
    checkPath(rel, 'Docker build input');
  }
  console.log(`[verify:docker] Dockerfile inputs OK (${required.size} paths)`);
}

function checkDockerDaemon() {
  const result = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return result.status === 0;
}

function main() {
  console.log('[verify:docker] 1/5 lockfile');
  checkLockfile();

  console.log('[verify:docker] 2/5 Dockerfile + repo inputs');
  auditDockerfileCopySources();

  console.log('[verify:docker] 3/5 pnpm install (docker linker, frozen)');
  run('pnpm install --frozen-lockfile --ignore-scripts');

  console.log('[verify:docker] 4/5 catalog + gateway build (docker linker)');
  run('pnpm catalog:generate');
  run('pnpm catalog:validate');
  run('pnpm exec turbo run build --filter=@ai-assistant/gateway...');

  console.log('[verify:docker] 5/5 gateway runtime module smoke test');
  execSync(
    `node -e "require('@ai-assistant/telemetry/register');require('@ai-assistant/auth');require('@ai-assistant/database');require('fs').accessSync('dist/index.js');console.log('gateway runtime deps OK')"`,
    {
      cwd: path.join(root, 'services', 'gateway'),
      stdio: 'inherit',
      env: dockerEnv,
      shell: process.platform === 'win32',
    },
  );

  if (checkDockerDaemon()) {
    console.log('[verify:docker] optional: running docker build...');
    execSync('docker build -t ai-assistant-render-test .', {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    console.log('[verify:docker] docker build OK');
  } else {
    console.log(
      '[verify:docker] docker daemon not running — skipped full image build (start Docker Desktop for that step)',
    );
  }

  console.log('[verify:docker] all checks passed');
}

try {
  main();
} catch (err) {
  console.error(`[verify:docker] FAILED: ${err.message ?? err}`);
  process.exit(1);
}
