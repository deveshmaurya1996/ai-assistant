import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { example: path.join(root, '.env.example'), env: path.join(root, '.env') },
  {
    example: path.join(root, '.env.production.example'),
    env: path.join(root, '.env.production'),
  },
  {
    example: path.join(root, 'apps', 'mobile', '.env.example'),
    env: path.join(root, 'apps', 'mobile', '.env'),
  },
  {
    example: path.join(root, 'apps', 'mobile', '.env.production.example'),
    env: path.join(root, 'apps', 'mobile', '.env.production'),
  },
];

function parseValues(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1);
  }
  return values;
}

function mergeFromExample(exampleContent, existing) {
  return exampleContent
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) return line;
      const key = trimmed.slice(0, eq).trim();
      if (Object.prototype.hasOwnProperty.call(existing, key)) {
        return `${key}=${existing[key]}`;
      }
      return line;
    })
    .join('\n')
    .replace(/\n?$/, '\n');
}

for (const { example, env } of targets) {
  if (!fs.existsSync(example)) {
    console.warn(`Skip: missing ${example}`);
    continue;
  }

  const exampleContent = fs.readFileSync(example, 'utf8');

  if (!fs.existsSync(env)) {
    fs.copyFileSync(example, env);
    console.log(`Created: ${path.relative(root, env)}`);
    continue;
  }

  const existing = parseValues(fs.readFileSync(env, 'utf8'));
  const merged = mergeFromExample(exampleContent, existing);
  fs.writeFileSync(env, merged, 'utf8');
  console.log(`Merged: ${path.relative(root, env)} (kept existing values)`);
}

console.log('\nLocal dev:  .env + apps/mobile/.env');
console.log('Production: .env.production (local test) or Render env vars');
console.log('On Render:  paste from .env.production.example into the single web service');
