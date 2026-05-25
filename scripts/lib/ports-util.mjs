import { execSync } from 'node:child_process';

export function portInUse(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync('netstat -ano -p tcp', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const suffix = `:${port}`;
      return out.split('\n').some((line) => line.includes('LISTENING') && (line.trim().split(/\s+/)[1] ?? '').endsWith(suffix));
    } catch {
      return false;
    }
  }
  try {
    execSync(`lsof -iTCP:${port} -sTCP:LISTEN`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function findFreePort(start) {
  for (let p = start; p < start + 500; p += 1) {
    if (!portInUse(p)) return p;
  }
  throw new Error(`No free port found near ${start}`);
}
