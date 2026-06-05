import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd) {
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

if (process.env.EAS_BUILD === 'true') {
  run(
    'pnpm --filter @ai-assistant/types build && pnpm --filter @ai-assistant/sdk build'
  );
  process.exit(0);
}

run(
  [
    'pnpm --filter @ai-assistant/config build',
    'pnpm --filter @ai-assistant/types build',
    'pnpm --filter @ai-assistant/telemetry build',
    'pnpm --filter @ai-assistant/tool-schema build',
    'pnpm --filter @ai-assistant/capabilities build',
    'pnpm --filter @ai-assistant/skills build',
    'pnpm --filter @ai-assistant/events build',
    'pnpm --filter @ai-assistant/permissions build',
    'pnpm --filter @ai-assistant/memory build',
    'pnpm --filter @ai-assistant/workflows build',
    'pnpm --filter @ai-assistant/storage build',
    'node scripts/prisma-generate.mjs --lenient',
    'pnpm --filter @ai-assistant/database build',
    'pnpm --filter @ai-assistant/integrations build',
    'pnpm --filter @ai-assistant/feature-flags build',
    'pnpm --filter @ai-assistant/sdk build',
  ].join(' && ')
);
