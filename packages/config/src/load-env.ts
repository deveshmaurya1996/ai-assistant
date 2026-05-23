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
 
export function loadMonorepoEnv(): void {
  if (loaded) return;

  const root = findMonorepoRoot();
  const envPath = path.join(root, '.env');

  if (fs.existsSync(envPath)) {
    loadDotenv({ path: envPath });
  }

  loaded = true;
}
