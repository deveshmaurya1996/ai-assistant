
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, '..');
const require = createRequire(import.meta.url);

let CAPABILITY_SOURCE;
try {
  CAPABILITY_SOURCE = require(join(pkgRoot, 'dist/capability-source.js')).CAPABILITY_SOURCE;
} catch {
  console.error('Build @ai-assistant/capabilities first: pnpm --filter @ai-assistant/capabilities build');
  process.exit(1);
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  capabilities: CAPABILITY_SOURCE.map((c) => ({
    id: c.id,
    domain: c.domain,
    description: c.description,
    risk: c.risk,
    requiresConfirmation: c.requiresConfirmation,
    plannerVisible: c.plannerVisible,
    resultSchema: c.resultSchema,
    providers: c.providers.map((p) => ({
      providerId: p.providerId,
      adapterAction: p.adapterAction,
      executionTool: p.executionTool,
    })),
  })),
};

const outDir = join(pkgRoot, 'generated');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'capability-manifest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2));

const cognitivePath = join(
  pkgRoot,
  '../../services/ai-runtime/capability_manifest.json'
);
copyFileSync(outPath, cognitivePath);

console.log(`Wrote ${outPath}`);
console.log(`Copied to ${cognitivePath}`);
