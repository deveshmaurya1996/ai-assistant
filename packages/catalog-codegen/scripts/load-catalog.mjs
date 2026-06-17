import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(__dirname, '../../..');
export const catalogRoot = join(repoRoot, 'catalog');

function loadYaml(name) {
  const path = join(catalogRoot, name);
  if (!existsSync(path)) throw new Error(`Missing catalog file: ${path}`);
  return YAML.parse(readFileSync(path, 'utf8'));
}

export function loadCatalog() {
  const providersDoc = loadYaml('providers.yaml');
  const capabilitiesDoc = loadYaml('capabilities.yaml');
  const toolsDoc = loadYaml('tools.yaml');
  const policyDoc = loadYaml('policy.yaml');
  return {
    providers: providersDoc.providers ?? [],
    capabilities: capabilitiesDoc.capabilities ?? [],
    tools: toolsDoc.tools ?? [],
    policy: {
      blockedTools: policyDoc.blockedTools ?? [],
      dangerousChains: policyDoc.dangerousChains ?? [],
      defaultAllowedSources: policyDoc.defaultAllowedSources ?? [
        'chat',
        'voice',
        'automation',
        'workflow',
        'manual',
      ],
      overrides: policyDoc.overrides ?? {},
    },
  };
}
