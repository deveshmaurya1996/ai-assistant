import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, '..');
const candidates = [
  path.join(mobileRoot, 'node_modules', 'expo', 'bin', 'cli'),
  path.join(mobileRoot, '..', '..', 'node_modules', 'expo', 'bin', 'cli'),
];

function clearMetroCache() {
  let removed = 0;

  try {
    for (const name of fs.readdirSync(os.tmpdir())) {
      if (name.startsWith('metro-file-map') && name.includes('expo')) {
        fs.rmSync(path.join(os.tmpdir(), name), { force: true });
        removed += 1;
      }
    }
  } catch {
    // ignore temp dir read errors
  }

  for (const relativePath of ['.expo/metro', 'node_modules/.cache/metro']) {
    const target = path.join(mobileRoot, relativePath);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      removed += 1;
    }
  }

  if (removed > 0) {
    console.log(`[metro] cleared ${removed} stale cache entr${removed === 1 ? 'y' : 'ies'}`);
  }
}

const expoCli = candidates.find((candidate) => fs.existsSync(candidate));
if (!expoCli) {
  console.error('[expo-cli] Could not find expo/bin/cli in the mobile app or monorepo root.');
  process.exit(1);
}

const args = [...process.argv.slice(2)];
const bundlerCommands = new Set(['start', 'run:android', 'run:ios']);

if (bundlerCommands.has(args[0])) {
  clearMetroCache();
  if (args[0] === 'start' && !args.includes('--clear')) {
    args.push('--clear');
  }
}

const result = spawnSync(process.execPath, [expoCli, ...args], {
  stdio: 'inherit',
  cwd: mobileRoot,
});

process.exit(result.status ?? 1);
