
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appConfigPath = join(root, 'apps/mobile/app.config.ts');
const manifestPath = join(root, 'apps/mobile/release-manifest.json');

const fromEas = process.argv.includes('--from-eas');
const promoteMin = process.argv.includes('--promote-min');

function readManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return {
      version: '1.0.0',
      minVersion: '1.0.0',
      androidVersionCode: 1,
      minAndroidVersionCode: 1,
    };
  }
}

function parseAppConfig() {
  const src = readFileSync(appConfigPath, 'utf8');
  const version = src.match(/^\s*version:\s*['"]([^'"]+)['"]/m)?.[1];
  const versionCode = src.match(/versionCode:\s*(\d+)/)?.[1];
  if (!version) throw new Error('Could not parse version from app.config.ts');
  return {
    version,
    androidVersionCode: versionCode ? parseInt(versionCode, 10) : 1,
  };
}

function fetchEasAndroidVersionCode() {
  try {
    const out = execSync('npx eas-cli build:version:get -p android --json', {
      cwd: join(root, 'apps/mobile'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    const data = JSON.parse(out);
    const code = data?.android?.versionCode ?? data?.versionCode;
    if (typeof code === 'number' && code > 0) return code;
  } catch {
    // EAS CLI not logged in or not available — fall back to app.config / manifest bump
  }
  return null;
}

const prev = readManifest();
const app = parseAppConfig();
let androidVersionCode = app.androidVersionCode;

if (fromEas) {
  const easCode = fetchEasAndroidVersionCode();
  if (easCode != null) androidVersionCode = easCode;
} else if (!fromEas && androidVersionCode <= (prev.androidVersionCode ?? 0)) {
  androidVersionCode = (prev.androidVersionCode ?? 0) + 1;
}

const next = {
  version: app.version,
  minVersion: promoteMin ? prev.version ?? prev.minVersion ?? '1.0.0' : app.version,
  androidVersionCode,
  minAndroidVersionCode: promoteMin
    ? prev.androidVersionCode ?? prev.minAndroidVersionCode ?? 1
    : androidVersionCode,
  updatedAt: new Date().toISOString(),
};

writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
console.log('[sync-mobile-release] Wrote', manifestPath);
console.log(JSON.stringify(next, null, 2));
