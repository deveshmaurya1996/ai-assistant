import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(mobileRoot, '..', '..');
const args = process.argv.slice(2).filter((a) => a !== '--');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
  return env;
}

function run(label, cmd, runArgs, cwd, env) {
  const r = spawnSync(cmd, runArgs, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    console.error(`[build-production-apk] ${label} failed`);
    process.exit(r.status ?? 1);
  }
}

function runCapture(cmd, runArgs) {
  return spawnSync(cmd, runArgs, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
}

function listAdbDevices() {
  const r = runCapture('adb', ['devices']);
  if (r.status !== 0) return [];
  return r.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'))
    .map((line) => line.split('\t')[0]);
}

function installApkOnDevice(apkPath) {
  const adbCheck = runCapture('adb', ['version']);
  if (adbCheck.status !== 0) {
    console.warn('[build-production-apk] adb not found; skipping install');
    return;
  }

  const devices = listAdbDevices();
  if (devices.length === 0) {
    console.warn('[build-production-apk] no adb device connected; skipping install');
    return;
  }

  for (const serial of devices) {
    const installArgs = devices.length === 1 ? ['install', '-r', apkPath] : ['-s', serial, 'install', '-r', apkPath];
    console.log(`[build-production-apk] Installing on ${serial}...`);
    const r = spawnSync('adb', installArgs, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (r.status !== 0) {
      console.error(`[build-production-apk] adb install failed for ${serial}`);
      process.exit(r.status ?? 1);
    }
  }
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function withWindowsSubstDrive(callback) {
  const drive = 'Z';
  const mount = `${drive}:\\`;
  let created = false;

  if (!fs.existsSync(mount)) {
    execSync(`subst ${drive}: "${repoRoot}"`, { stdio: 'pipe' });
    created = true;
  }

  try {
    callback(mount);
  } finally {
    if (created) {
      try {
        execSync(`subst ${drive}: /d`, { stdio: 'pipe' });
      } catch {
        // ignore
      }
    }
  }
}

const fromProduction = loadEnvFile(path.join(mobileRoot, '.env.production'));
const fromRoot = loadEnvFile(path.join(repoRoot, '.env'));
const apiUrl =
  fromProduction.EXPO_PUBLIC_API_URL ||
  fromRoot.API_PUBLIC_URL ||
  fromRoot.EXPO_PUBLIC_API_URL;

if (!apiUrl || /localhost|127\.0\.0\.1/i.test(apiUrl)) {
  console.error('Set EXPO_PUBLIC_API_URL in apps/mobile/.env.production (production URL, not localhost).');
  process.exit(1);
}

const env = {
  NODE_ENV: 'production',
  EXPO_PUBLIC_API_URL: apiUrl,
  EXPO_PUBLIC_GOOGLE_AUTH_ENABLED:
    fromProduction.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED ?? fromRoot.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED ?? 'true',
};

console.log('[build-production-apk] Production API:', apiUrl);

run('eas-build-post-install', 'pnpm', ['run', 'eas-build-post-install'], mobileRoot, env);

if (args.includes('--prebuild')) {
  const prebuildArgs = ['scripts/expo-cli.mjs', 'prebuild', '--platform', 'android'];
  if (args.includes('--clean')) prebuildArgs.push('--clean');
  run('expo prebuild', 'node', prebuildArgs, mobileRoot, env);
}

const androidDir = path.join(mobileRoot, 'android');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const releaseArgs = ['assembleRelease', '-PreactNativeArchitectures=arm64-v8a'];

if (process.platform === 'win32') {
  const winEnv = {
    ...env,
    EXPO_PROJECT_ROOT: mobileRoot,
  };
  withWindowsSubstDrive((mount) => {
    const shortAndroid = path.join(mount, 'apps', 'mobile', 'android');
    rmDir(path.join(shortAndroid, 'app', '.cxx'));
    console.log('[build-production-apk] Windows: Z:\\ short paths, Metro via real project root');
    run('assembleRelease', gradlew, releaseArgs, shortAndroid, winEnv);
  });
} else {
  run('assembleRelease', gradlew, releaseArgs, androidDir, env);
}

const version = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8')).version;
const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const out = path.join(mobileRoot, 'dist', `ai-assistant-${version}-production.apk`);

if (!fs.existsSync(apk)) {
  console.error('[build-production-apk] APK not found:', apk);
  process.exit(1);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.copyFileSync(apk, out);
console.log('\n[build-production-apk] APK ready:', out);

if (!args.includes('--no-install')) {
  installApkOnDevice(out);
}
