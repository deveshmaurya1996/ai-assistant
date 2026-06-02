import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 2_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dockerCmd(args) {
  return spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
}

export function hasDockerCli() {
  const r = dockerCmd(['--version']);
  return r.status === 0;
}

export function isDockerReady() {
  const r = dockerCmd(['info']);
  return r.status === 0;
}

function findDockerDesktopExe() {
  const envPath = process.env.DOCKER_DESKTOP_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = [];
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA ?? '';
    candidates.push(
      path.join(programFiles, 'Docker', 'Docker', 'Docker Desktop.exe'),
      path.join(programFilesX86, 'Docker', 'Docker', 'Docker Desktop.exe'),
      path.join(localAppData, 'Programs', 'Docker', 'Docker', 'Docker Desktop.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Docker.app/Contents/MacOS/Docker');
  }

  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function startDockerDesktop() {
  if (process.platform === 'win32') {
    const exe = findDockerDesktopExe();
    if (!exe) return false;
    spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return true;
  }

  if (process.platform === 'darwin') {
    const r = spawnSync('open', ['-a', 'Docker'], { stdio: 'ignore' });
    return r.status === 0;
  }

  if (process.platform === 'linux') {
    const userUnit = spawnSync('systemctl', ['--user', 'start', 'docker-desktop'], { stdio: 'ignore' });
    if (userUnit.status === 0) return true;
    const systemUnit = spawnSync('systemctl', ['start', 'docker'], { stdio: 'ignore' });
    return systemUnit.status === 0;
  }

  return false;
}

export async function ensureDocker(options = {}) {
  if (process.env.SKIP_DOCKER_ENSURE === '1' || process.env.SKIP_DOCKER_ENSURE === 'true') {
    return;
  }

  if (!hasDockerCli()) {
    throw new Error(
      'Docker CLI not found. Install Docker Desktop (https://docs.docker.com/desktop/) and retry.',
    );
  }

  if (isDockerReady()) return;

  console.log('Docker is not running — starting Docker Desktop…');

  if (!startDockerDesktop()) {
    throw new Error(
      'Could not start Docker Desktop automatically. Start it manually, then run pnpm tilt:up again.\n' +
        'On Windows, set DOCKER_DESKTOP_PATH to your Docker Desktop.exe if it is installed elsewhere.',
    );
  }

  const timeoutMs =
    Number(process.env.DOCKER_ENSURE_TIMEOUT_MS) || options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    if (isDockerReady()) {
      console.log('Docker is ready.');
      return;
    }
    process.stdout.write('\rWaiting for Docker to start…');
  }

  process.stdout.write('\n');
  throw new Error(
    `Docker did not become ready within ${Math.round(timeoutMs / 1000)}s. ` +
      'Open Docker Desktop, wait until it shows "running", then run pnpm tilt:up again.',
  );
}
