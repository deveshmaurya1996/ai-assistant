import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 2_000;
const DEFAULT_PULL_ATTEMPTS = 5;
const PULL_RETRY_DELAY_MS = 3_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, '../..');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dockerCmd(args, { stdio = ['ignore', 'pipe', 'pipe'] } = {}) {
  return spawnSync('docker', args, {
    encoding: 'utf8',
    stdio,
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

export function imageExists(imageRef) {
  const r = dockerCmd(['image', 'inspect', imageRef]);
  return r.status === 0;
}

export function coreImagesFromCompose(root = defaultRoot) {
  const composePath = path.join(root, 'infra/docker/compose.core.yml');
  if (!fs.existsSync(composePath)) return [];

  const images = [];
  for (const match of fs.readFileSync(composePath, 'utf8').matchAll(/^\s+image:\s*(\S+)\s*$/gm)) {
    images.push(match[1]);
  }
  return [...new Set(images)];
}

export function toMirrorRef(imageRef) {
  const slash = imageRef.indexOf('/');
  const colon = imageRef.indexOf(':');
  const hasNamespace = slash !== -1 && (colon === -1 || slash < colon);
  if (!hasNamespace) return `mirror.gcr.io/library/${imageRef}`;
  return `mirror.gcr.io/${imageRef}`;
}

function pullImageSync(imageRef) {
  return dockerCmd(['pull', imageRef], { stdio: 'inherit' });
}

function tagImageSync(source, target) {
  return dockerCmd(['tag', source, target], { stdio: 'inherit' });
}

export async function pullImage(imageRef, options = {}) {
  const maxAttempts = Number(process.env.DOCKER_PULL_ATTEMPTS) || options.maxAttempts || DEFAULT_PULL_ATTEMPTS;
  const useMirrorFallback = options.mirrorFallback !== false && process.env.DOCKER_PULL_MIRROR !== '0';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      console.log(`Retrying ${imageRef} (${attempt}/${maxAttempts})…`);
    } else {
      console.log(`Pulling ${imageRef}…`);
    }

    const result = pullImageSync(imageRef);
    if (result.status === 0) return;

    if (attempt < maxAttempts) await sleep(PULL_RETRY_DELAY_MS);
  }

  if (!useMirrorFallback) {
    throw new Error(`Failed to pull ${imageRef} after ${maxAttempts} attempt(s).`);
  }

  const mirrorRef = toMirrorRef(imageRef);
  console.log(`Docker Hub pull failed for ${imageRef} — trying mirror ${mirrorRef}…`);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      console.log(`Retrying mirror ${mirrorRef} (${attempt}/${maxAttempts})…`);
    }

    const result = pullImageSync(mirrorRef);
    if (result.status === 0) {
      const tagResult = tagImageSync(mirrorRef, imageRef);
      if (tagResult.status !== 0) {
        throw new Error(`Pulled ${mirrorRef} but failed to tag it as ${imageRef}.`);
      }
      return;
    }

    if (attempt < maxAttempts) await sleep(PULL_RETRY_DELAY_MS);
  }

  throw new Error(
    `Failed to pull ${imageRef} (and mirror ${mirrorRef}) after ${maxAttempts} attempt(s). ` +
      'Check your network/VPN, restart Docker Desktop, then run pnpm dev again.',
  );
}

export async function ensureCoreImages(options = {}) {
  const root = options.root ?? defaultRoot;
  const images = coreImagesFromCompose(root);
  if (!images.length) return;

  const missing = images.filter((imageRef) => !imageExists(imageRef));
  if (!missing.length) return;

  console.log(`Downloading ${missing.length} Docker image(s) for local infra…`);
  for (const imageRef of missing) {
    await pullImage(imageRef, options);
  }
  console.log('Docker images ready.');
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

  if (!isDockerReady()) {
    console.log('Docker is not running — starting Docker Desktop…');

    if (!startDockerDesktop()) {
      throw new Error(
        'Could not start Docker Desktop automatically. Start it manually, then run pnpm dev again.\n' +
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
        break;
      }
      process.stdout.write('\rWaiting for Docker to start…');
    }

    if (!isDockerReady()) {
      process.stdout.write('\n');
      throw new Error(
        `Docker did not become ready within ${Math.round(timeoutMs / 1000)}s. ` +
          'Open Docker Desktop, wait until it shows "running", then run pnpm dev again.',
      );
    }

    if (process.stdout.isTTY) process.stdout.write('\n');
  }

  await ensureCoreImages(options);
}
