import { loadCatalog } from './load-catalog.mjs';

const catalog = loadCatalog();
const errors = [];
const toolNames = new Set(catalog.tools.map((t) => t.name));
const providerIds = new Set(catalog.providers.map((p) => p.id));

for (const cap of catalog.capabilities) {
  for (const b of cap.bindings) {
    if (!toolNames.has(b.tool)) {
      errors.push(`capability ${cap.id}: unknown tool '${b.tool}'`);
    }
    if (!providerIds.has(b.providerId)) {
      errors.push(`capability ${cap.id}: unknown provider '${b.providerId}'`);
    }
  }
}

for (const tool of catalog.tools) {
  if (!providerIds.has(tool.providerId)) {
    errors.push(`tool ${tool.name}: unknown provider '${tool.providerId}'`);
  }
}

for (const blocked of catalog.policy.blockedTools) {
  if (toolNames.has(blocked)) {
    errors.push(`blocked tool '${blocked}' should not exist in tools.yaml`);
  }
}

if (errors.length) {
  console.error('catalog:validate FAILED');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `catalog:validate OK (${catalog.providers.length} providers, ${catalog.capabilities.length} capabilities, ${catalog.tools.length} tools)`
);
