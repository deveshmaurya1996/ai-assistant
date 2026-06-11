
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

const target = process.argv[2];

switch (target) {
  case 'ffmpeg':
    run('python scripts/verify-ffmpeg.py');
    break;
  case 'file-pipeline':
    run('node scripts/with-env.mjs node scripts/verify-file-pipeline.mjs');
    break;
  case 'attachment':
    run('node scripts/with-env.mjs node scripts/verify-attachment-chat.mjs');
    break;
  case 'db':
    run('node scripts/verify-db-setup.mjs');
    break;
  case 'planner':
    validatePlanner();
    break;
  case 'planner:fixture':
    validatePlanner({ fixture: true });
    break;
  case 'planner:live':
    validatePlanner({ live: true });
    break;
  case 'planner:pytest':
    validatePlanner({ pytest: true });
    break;
  case 'planner:examples':
    run('node scripts/validate-planner-examples.mjs');
    break;
  case 'catalog':
    run('pnpm catalog:validate');
    break;
  default:
    console.error(
      'Usage: node scripts/verify.mjs <ffmpeg|file-pipeline|attachment|db|catalog|planner|planner:fixture|planner:live|planner:pytest|planner:examples>',
    );
    process.exit(1);
}
