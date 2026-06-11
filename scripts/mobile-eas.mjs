
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const COMMANDS = {
  build: 'eas:build:android:prod',
  'build:preview': 'eas:build:android:preview',
  update: 'eas:update:production',
  'update:preview': 'eas:update:preview',
};

const sub = process.argv[2];
const script = COMMANDS[sub];

if (!script) {
  console.error('Usage: node scripts/mobile-eas.mjs <build|build:preview|update|update:preview>');
  process.exit(1);
}

execSync(`pnpm --filter @ai-assistant/mobile run ${script}`, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
