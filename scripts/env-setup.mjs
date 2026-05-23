
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { example: path.join(root, '.env.example'), env: path.join(root, '.env') },
  {
    example: path.join(root, 'apps', 'mobile', '.env.example'),
    env: path.join(root, 'apps', 'mobile', '.env'),
  },
];

for (const { example, env } of targets) {
  if (!fs.existsSync(example)) {
    console.warn(`Skip: missing ${example}`);
    continue;
  }
  if (fs.existsSync(env)) {
    console.log(`Keep: ${path.relative(root, env)}`);
    continue;
  }
  fs.copyFileSync(example, env);
  console.log(`Created: ${path.relative(root, env)}`);
}

console.log('\nEdit .env files with your API keys (GEMINI_API_KEY, OPENAI_API_KEY).');
