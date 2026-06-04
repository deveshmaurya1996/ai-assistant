import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(mobileDir, '.easignore');
const target = join(mobileDir, '..', '..', '.easignore');

const rootRules = readFileSync(source, 'utf8').replace(/^\.\.\/\.\.\//gm, '');
writeFileSync(target, rootRules);
