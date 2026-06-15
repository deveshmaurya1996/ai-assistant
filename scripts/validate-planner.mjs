
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

export function validatePlanner({ live = false, fixture = false, pytest = false } = {}) {
  if (process.env.SKIP_PLANNER_VALIDATION === '1') {
    console.log('[postinstall] SKIP_PLANNER_VALIDATION=1 — skipping connectors + planner checks');
    return;
  }

  console.log('[postinstall] validating connectors...');
  run('node packages/connectors/scripts/sync.mjs');

  if (pytest) {
    console.log('[postinstall] ai-runtime agent pytest...');
    run('python -m pytest services/ai-runtime/tests -q');
    return;
  }

  let mode = 'heuristic';
  if (live || process.env.PLANNER_EVAL_LIVE === '1') {
    mode = 'live';
  } else if (fixture) {
    mode = 'fixture';
  }

  console.log(`[postinstall] planner ${mode} eval...`);
  run(`python scripts/planner-eval.py --mode=${mode}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    validatePlanner({ live: process.argv.includes('--live') });
  } catch {
    console.error('[postinstall] planner validation failed');
    process.exit(1);
  }
}
