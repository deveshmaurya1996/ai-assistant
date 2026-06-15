import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadCatalog, repoRoot } from './load-catalog.mjs';

const catalog = loadCatalog();
const header = `/** AUTO-GENERATED from catalog/*.yaml — do not edit by hand. Run: pnpm catalog:generate */\n`;

function writeGenerated(relPath, content) {
  const full = join(repoRoot, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  console.log(`  wrote ${relPath}`);
}

// --- capability-source.ts ---
const domainUnion = [
  'messaging',
  'email',
  'calendar',
  'files',
  'contacts',
  'platform',
  'image',
];
const capEntries = catalog.capabilities
  .map((c) => {
    const providers = c.bindings
      .map((b) => {
        const perms = b.permissions?.length
          ? `permissions: ${JSON.stringify(b.permissions)}, `
          : '';
        return `      {
        providerId: '${b.providerId}',
        adapterAction: '${b.adapterAction ?? b.tool.split('.').pop()}',
        executionTool: '${b.tool}',
        ${perms}
      }`.replace(/,\s*\n      \}/, '\n      }');
      })
      .join(',\n');
    return `  {
    id: '${c.id}',
    domain: '${c.domain}',
    description: ${JSON.stringify(c.description)},
    risk: '${c.risk}',
    requiresConfirmation: ${c.requiresConfirmation},
    plannerVisible: ${c.plannerVisible},
    resultSchema: '${c.resultSchema}',
    providers: [
${providers}
    ],
  }`;
  })
  .join(',\n');

writeGenerated(
  'packages/capabilities/src/generated/capability-source.ts',
  `${header}
import type { RiskLevel } from '../types';

export interface CapabilityProviderSource {
  providerId: string;
  adapterAction: string;
  executionTool: string;
  permissions?: string[];
}

export interface CapabilitySourceEntry {
  id: string;
  domain: ${domainUnion.map((d) => `'${d}'`).join(' | ')};
  description: string;
  risk: RiskLevel;
  requiresConfirmation: boolean;
  plannerVisible: boolean;
  resultSchema: string;
  providers: CapabilityProviderSource[];
}

export const CAPABILITY_SOURCE: CapabilitySourceEntry[] = [
${capEntries}
];

export function getPlannerVisibleCapabilities(): CapabilitySourceEntry[] {
  return CAPABILITY_SOURCE.filter((c) => c.plannerVisible);
}
`
);

// --- capability-manifest.json ---
// Written twice: TS packages read packages/capabilities/generated/; Python ai-runtime reads services/ai-runtime/.
const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  capabilities: catalog.capabilities.map((c) => ({
    id: c.id,
    domain: c.domain,
    description: c.description,
    risk: c.risk,
    requiresConfirmation: c.requiresConfirmation,
    plannerVisible: c.plannerVisible,
    resultSchema: c.resultSchema,
    providers: c.bindings.map((b) => ({
      providerId: b.providerId,
      adapterAction: b.adapterAction ?? b.tool.split('.').pop(),
      executionTool: b.tool,
    })),
  })),
};
const manifestJson = JSON.stringify(manifest, null, 2);
writeGenerated('packages/capabilities/generated/capability-manifest.json', manifestJson);
const cognitivePath = join(repoRoot, 'services/ai-runtime/capability_manifest.json');
writeFileSync(cognitivePath, manifestJson);
console.log(`  wrote services/ai-runtime/capability_manifest.json`);

// --- providers.ts (display names + known IDs) ---
const enabledProviders = catalog.providers.filter((p) => p.enabled !== false);
writeGenerated(
  'packages/capabilities/src/generated/providers.ts',
  `${header}
export const KNOWN_PROVIDER_IDS = ${JSON.stringify(enabledProviders.map((p) => p.id))} as const;

export const PROVIDER_DISPLAY: Record<string, string> = {
${enabledProviders
  .filter((p) => p.id !== 'platform')
  .map((p) => `  ${p.id}: ${JSON.stringify(p.displayName ?? p.name)},`)
  .join('\n')}
};
`
);

// --- tool-meta.ts ---
writeGenerated(
  'packages/tool-schema/src/generated/tool-meta.ts',
  `${header}
export interface ToolCatalogMeta {
  name: string;
  version: string;
  connector: string;
  description: string;
  schemaRef: string;
  supportsCancellation: boolean;
  dangerous: boolean;
}

export const TOOL_CATALOG_META: ToolCatalogMeta[] = ${JSON.stringify(
    catalog.tools.map((t) => ({
      name: t.name,
      version: t.version ?? '1',
      connector: t.providerId,
      description: t.description,
      schemaRef: t.schemaRef,
      supportsCancellation: t.supportsCancellation ?? false,
      dangerous: t.dangerous ?? false,
    })),
    null,
    2
  )};

export const PLATFORM_TOOL_NAMES = TOOL_CATALOG_META.filter((t) => t.connector === 'platform').map(
  (t) => t.name
);

export function isPlatformTool(name: string): boolean {
  return PLATFORM_TOOL_NAMES.includes(name);
}
`
);

// --- default-policies.ts ---
const policyEntries = catalog.tools.map((t) => {
  const override = catalog.policy.overrides[t.name] ?? {};
  const requiresConfirmation = override.requiresConfirmation ?? t.dangerous ?? false;
  const dangerous = override.dangerous ?? t.dangerous ?? false;
  const automationRequiresPreApproval =
    override.automationRequiresPreApproval ?? dangerous;
  const allowedSources =
    override.allowedSources ?? catalog.policy.defaultAllowedSources;
  const lines = [
    `  {`,
    `    tool: '${t.name}',`,
    `    requiresConfirmation: ${requiresConfirmation},`,
    `    allowedSources: ${JSON.stringify(allowedSources)},`,
    `    dangerous: ${dangerous},`,
  ];
  if (override.cooldownSeconds != null) {
    lines.push(`    cooldownSeconds: ${override.cooldownSeconds},`);
  }
  if (override.maxExecutionsPerHour != null) {
    lines.push(`    maxExecutionsPerHour: ${override.maxExecutionsPerHour},`);
  }
  lines.push(`    automationRequiresPreApproval: ${automationRequiresPreApproval},`);
  lines.push(`  },`);
  return lines.join('\n');
});

writeGenerated(
  'packages/permissions/src/generated/default-policies.ts',
  `${header}
import type { ToolPolicy } from '../types';

export const GENERATED_DEFAULT_POLICIES: ToolPolicy[] = [
${policyEntries.join('\n')}
];
`
);

// --- integration-policy (blocked tools) ---
writeGenerated(
  'packages/tool-schema/src/generated/integration-policy.ts',
  `${header}
export const BLOCKED_INTEGRATION_TOOLS = new Set<string>([
${catalog.policy.blockedTools.map((t) => `  '${t}',`).join('\n')}
]);

export function isBlockedIntegrationTool(tool: string): boolean {
  return BLOCKED_INTEGRATION_TOOLS.has(tool);
}
`
);

// --- seed-providers.sql ---
const sqlRows = enabledProviders
  .filter((p) => p.id !== 'platform')
  .map((p) => {
    const scopes = (p.scopes ?? []).map((s) => `'${s}'`).join(', ');
    const scopesArr = scopes ? `ARRAY[${scopes}]` : `ARRAY[]::text[]`;
    return `  ('${p.id}', '${p.name.replace(/'/g, "''")}', '${p.authType}', ${scopesArr}, ${p.enabled !== false}, CURRENT_TIMESTAMP)`;
  });
writeGenerated(
  'packages/database/prisma/seed-providers.sql',
  `-- AUTO-GENERATED from catalog/providers.yaml — do not edit by hand
INSERT INTO "IntegrationProvider" ("id", "name", "authType", "scopes", "isEnabled", "updatedAt") VALUES
${sqlRows.join(',\n')}
ON CONFLICT ("id") DO NOTHING;
`
);

const nsEntries = [];
for (const p of enabledProviders) {
  if (!p.toolNamespaces?.length || p.id === 'platform') continue;
  for (const ns of p.toolNamespaces) {
    nsEntries.push(`toolNamespaceToProvider.set('${ns}', '${p.id}');`);
  }
}
if (!nsEntries.some((l) => l.includes("'email'"))) {
  nsEntries.push(`toolNamespaceToProvider.set('email', 'google');`);
}
if (!nsEntries.some((l) => l.includes("'messaging'"))) {
  nsEntries.push(`toolNamespaceToProvider.set('messaging', 'whatsapp');`);
}

writeGenerated(
  'packages/integration-runtime/src/generated/provider-registry.ts',
  `${header}
import type { IntegrationConnector } from '../types';
import { GoogleConnector } from '../google';
import { WhatsAppConnector } from '../whatsapp';

export const CONNECTOR_IMPLEMENTATIONS: IntegrationConnector[] = [
  new GoogleConnector(),
  new WhatsAppConnector(),
];

export function registerProviderNamespaces(
  toolNamespaceToProvider: Map<string, string>
): void {
${nsEntries.map((l) => `  ${l}`).join('\n')}
}
`
);

console.log('catalog:generate OK');
