
import { spawnSync } from 'node:child_process';

const PORTS = [3000, 8081];

function run(cmd, args) {
  return spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

const adbCheck = run('adb', ['version']);
if (adbCheck.status !== 0) {
  console.warn('[adb-reverse] adb not found; skipping port forwards');
  process.exit(0);
}

for (const port of PORTS) {
  const spec = `tcp:${port}`;
  console.log(`[adb-reverse] adb reverse ${spec} ${spec}`);
  const result = run('adb', ['reverse', spec, spec]);
  if (result.status !== 0) {
    console.warn(`[adb-reverse] failed for port ${port} (no device yet?)`);
  }
}
