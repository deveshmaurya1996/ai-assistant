
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = 'ai-assistant';

const PROFILES = {
  core: ['-f', 'infra/docker/compose.core.yml'],
  monitoring: ['-f', 'infra/docker/compose.core.yml', '-f', 'infra/docker/compose.monitoring.yml'],
  full: ['-f', 'infra/docker/compose.dev.yml'],
  voice: ['-f', 'infra/docker/compose.core.yml', '-f', 'infra/docker/compose.voice.yml'],
  production: ['-f', 'infra/docker/compose.production.yml'],
};

function run(cmd) {
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

const [cmd, profile = 'core'] = process.argv.slice(2);

if (cmd === 'up') {
  const files = PROFILES[profile];
  if (!files) {
    console.error(`Unknown profile: ${profile} (use core | monitoring | full | voice | production)`);
    process.exit(1);
  }
  const envFile =
    profile === 'core'
      ? ' --env-file .env'
      : profile === 'production'
        ? ' --env-file .env.production'
        : '';
  run(`docker compose -p ${project}${envFile} ${files.join(' ')} up -d`);
} else if (cmd === 'down') {
  const downProfile = process.argv[3] || 'dev';
  if (downProfile === 'production') {
    run(
      'docker compose -p ai-assistant --env-file .env.production -f infra/docker/compose.production.yml down',
    );
  } else {
    run(`docker compose -p ${project} -f infra/docker/compose.dev.yml down`);
  }
} else if (cmd === 'build') {
  run(
    'docker compose -p ai-assistant --env-file .env.production -f infra/docker/compose.production.yml build',
  );
} else {
  console.error(
    'Usage: node scripts/docker.mjs up [core|monitoring|full|voice|production] | down [dev|production] | build',
  );
  process.exit(1);
}
