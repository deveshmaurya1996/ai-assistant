
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileEnvPath = path.join(__dirname, '..', '.env');
const DEFAULT_API_PORT = 3000;
const METRO_PORT = 8081;
const LIVEKIT_PORT = 7880;

function readApiPortFromEnv() {
  if (!fs.existsSync(mobileEnvPath)) return DEFAULT_API_PORT;
  const content = fs.readFileSync(mobileEnvPath, 'utf8');
  const match = content.match(/^EXPO_PUBLIC_API_URL=(.+)$/m);
  if (!match) return DEFAULT_API_PORT;
  try {
    const url = new URL(match[1].trim());
    if (url.port) {
      const port = Number(url.port);
      if (Number.isFinite(port) && port > 0) return port;
    }
    return url.protocol === 'https:' ? 443 : 80;
  } catch {
    return DEFAULT_API_PORT;
  }
}

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

const ports = [...new Set([readApiPortFromEnv(), METRO_PORT, LIVEKIT_PORT])];
for (const port of ports) {
  const spec = `tcp:${port}`;
  console.log(`[adb-reverse] adb reverse ${spec} ${spec}`);
  const result = run('adb', ['reverse', spec, spec]);
  if (result.status !== 0) {
    console.warn(`[adb-reverse] failed for port ${port} (no device yet?)`);
  }
}
