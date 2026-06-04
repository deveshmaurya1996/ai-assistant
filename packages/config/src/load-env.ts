import fs from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

let loaded = false;

export function findMonorepoRoot(startDir = process.cwd()): string {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return process.cwd();
}

export function resolveEnvFilePath(root: string): string | null {
  const explicit = process.env.ENV_FILE?.trim();
  if (explicit) {
    const p = path.isAbsolute(explicit) ? explicit : path.join(root, explicit);
    return fs.existsSync(p) ? p : null;
  }

  const production =
    process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  const prodPath = path.join(root, '.env.production');
  const localPath = path.join(root, '.env');

  if (production && fs.existsSync(prodPath)) return prodPath;
  if (fs.existsSync(localPath)) return localPath;
  if (fs.existsSync(prodPath)) return prodPath;
  return null;
}

export function loadMonorepoEnv(): void {
  if (loaded) return;

  const root = findMonorepoRoot();
  const envPath = resolveEnvFilePath(root);

  if (envPath) {
    loadDotenv({ path: envPath });
  }

  loaded = true;
}
