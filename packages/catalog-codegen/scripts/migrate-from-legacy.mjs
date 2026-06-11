
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');
const require = createRequire(import.meta.url);

const { CAPABILITY_SOURCE } = require(
  join(repoRoot, 'packages/capabilities/dist/capability-source.js')
);

const capabilities = CAPABILITY_SOURCE.map((c) => ({
  id: c.id,
  domain: c.domain,
  description: c.description,
  risk: c.risk,
  requiresConfirmation: c.requiresConfirmation,
  plannerVisible: c.plannerVisible,
  resultSchema: c.resultSchema,
  bindings: c.providers.map((p) => ({
    providerId: p.providerId,
    tool: p.executionTool,
    adapterAction: p.adapterAction,
    ...(p.permissions?.length ? { permissions: p.permissions } : {}),
  })),
}));

writeFileSync(
  join(repoRoot, 'catalog/capabilities.yaml'),
  YAML.stringify({ version: 1, capabilities }, { lineWidth: 120 })
);

const toolSchemaSrc = await import('node:fs').then((fs) =>
  fs.readFileSync(join(repoRoot, 'packages/tool-schema/src/index.ts'), 'utf8')
);

const tools = [];
const entryRe =
  /\{\s*name:\s*'([^']+)',\s*version:\s*'([^']+)',\s*connector:\s*'([^']+)',\s*description:\s*'([^']*(?:\\'[^']*)*)',\s*parameters:\s*(\w+),[\s\S]*?supportsCancellation:\s*(true|false),[\s\S]*?dangerous:\s*(true|false),/g;

let m;
while ((m = entryRe.exec(toolSchemaSrc)) !== null) {
  tools.push({
    name: m[1],
    version: m[2],
    providerId: m[3],
    description: m[4].replace(/\\'/g, "'"),
    schemaRef: m[5],
    supportsCancellation: m[6] === 'true',
    dangerous: m[7] === 'true',
  });
}

if (tools.length < 20) {
  const blocks = toolSchemaSrc.split(/\n  \{\n    name: '/).slice(1);
  tools.length = 0;
  for (const block of blocks) {
    const name = block.match(/^([^']+)'/)?.[1];
    const version = block.match(/version: '([^']+)'/)?.[1] ?? '1';
    const connector = block.match(/connector: '([^']+)'/)?.[1];
    const descMatch = block.match(/description:\s*'([^']+)'|description:\s*\n\s*'([^']+)'/);
    const description = descMatch?.[1] ?? descMatch?.[2] ?? '';
    const schemaRef = block.match(/parameters:\s*(\w+)/)?.[1];
    const supportsCancellation = /supportsCancellation:\s*true/.test(block);
    const dangerous = /dangerous:\s*true/.test(block);
    if (name && connector) {
      tools.push({
        name,
        version,
        providerId: connector,
        description,
        schemaRef: schemaRef ?? 'z.object({})',
        supportsCancellation,
        dangerous,
      });
    }
  }
}

writeFileSync(
  join(repoRoot, 'catalog/tools.yaml'),
  YAML.stringify({ version: 1, tools }, { lineWidth: 120 })
);

console.log(`Wrote catalog/capabilities.yaml (${capabilities.length} capabilities)`);
console.log(`Wrote catalog/tools.yaml (${tools.length} tools)`);
