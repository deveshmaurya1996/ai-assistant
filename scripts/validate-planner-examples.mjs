
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestCandidates = [
  path.join(root, 'packages', 'capabilities', 'generated', 'capability-manifest.json'),
  path.join(root, 'services', 'ai-runtime', 'capability_manifest.json'),
];

function loadManifest() {
  const manifestPath = manifestCandidates.find((p) => fs.existsSync(p));
  if (!manifestPath) {
    console.warn('[planner-examples] manifest not found — run pnpm build first');
    process.exit(0);
  }
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const ids = new Set((data.capabilities || []).map((c) => c.id));
  return ids;
}

function parseExampleOutputs(content) {
  const outputs = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*output:\s*['"](.+?)['"]\s*$/);
    if (!m) continue;
    try {
      const parsed = JSON.parse(m[1].replace(/\\"/g, '"'));
      for (const cap of parsed.capabilities || []) {
        if (cap.capability) outputs.push(cap.capability);
      }
    } catch {
      console.warn('[planner-examples] skip unparseable output line');
    }
  }
  return outputs;
}

const capIds = loadManifest();
const plannerRoot = path.join(root, 'planner-config', 'planner');
let errors = 0;

for (const pack of ['capability', 'scheduling']) {
  const examplesPath = path.join(plannerRoot, pack, 'v1', 'examples.yaml');
  if (!fs.existsSync(examplesPath)) continue;
  const caps = parseExampleOutputs(fs.readFileSync(examplesPath, 'utf8'));
  for (const id of caps) {
    if (!capIds.has(id)) {
      console.error(`[planner-examples] unknown capability in ${pack}/v1/examples.yaml: ${id}`);
      errors += 1;
    }
  }
}

if (errors) {
  process.exit(1);
}
console.log('[planner-examples] OK');
