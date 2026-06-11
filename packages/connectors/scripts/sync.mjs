
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const connectorsRoot = path.join(root, 'connectors');
const providersPath = path.join(root, 'catalog', 'providers.yaml');

const errors = [];
const warnings = [];

function loadCatalogProviderIds() {
  if (!fs.existsSync(providersPath)) {
    errors.push(`Missing catalog file: ${providersPath}`);
    return new Set();
  }
  const doc = parseYaml(fs.readFileSync(providersPath, 'utf8'));
  const ids = (doc.providers ?? [])
    .filter((p) => p.enabled !== false && p.id !== 'platform')
    .map((p) => p.id);
  return new Set(ids);
}

function loadMeta(connectorDir) {
  const metaPath = path.join(connectorDir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

const catalogProviderIds = loadCatalogProviderIds();

if (!fs.existsSync(connectorsRoot)) {
  errors.push(`Missing connectors directory: ${connectorsRoot}`);
} else {
  const entries = fs
    .readdirSync(connectorsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory());

  for (const entry of entries) {
    const dir = path.join(connectorsRoot, entry.name);
    const meta = loadMeta(dir);
    if (!meta) {
      errors.push(`Missing meta.json: ${dir}`);
      continue;
    }

    if (!meta.id) errors.push(`${dir}: meta.json missing id`);
    if (!meta.providerIds?.length) errors.push(`${dir}: meta.json missing providerIds`);
    if (!meta.domains?.length) errors.push(`${dir}: meta.json missing domains`);

    for (const providerId of meta.providerIds ?? []) {
      if (providerId === 'platform') continue;
      if (!catalogProviderIds.has(providerId)) {
        errors.push(
          `${dir}: providerId "${providerId}" not found in catalog/providers.yaml`
        );
      }
    }

    const playbookPath = path.join(dir, 'PLAYBOOK.md');
    if (!fs.existsSync(playbookPath)) {
      warnings.push(`Missing PLAYBOOK.md: ${dir}`);
    }
  }
}

if (warnings.length) {
  for (const w of warnings) console.warn(`[connectors:sync] warn: ${w}`);
}

if (errors.length) {
  for (const e of errors) console.error(`[connectors:sync] error: ${e}`);
  process.exit(1);
}

console.log(`[connectors:sync] OK — validated ${fs.readdirSync(connectorsRoot).length} connector(s)`);
