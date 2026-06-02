import { CAPABILITY_SOURCE } from './capability-source';
import type {
  CapabilityDefinition,
  ProviderBinding,
  ResolvedCapabilityExecution,
} from './types';

function toDefinition(entry: (typeof CAPABILITY_SOURCE)[number]): CapabilityDefinition {
  const providers: ProviderBinding[] = entry.providers.map((p) => ({
    providerId: p.providerId,
    legacyTool: p.executionTool,
    adapterAction: p.adapterAction,
  }));
  const permissions = [
    ...new Set(entry.providers.flatMap((p) => p.permissions ?? [`${p.providerId}.read`])),
  ];
  return {
    id: entry.id,
    domain: entry.domain,
    description: entry.description,
    providers,
    permissions,
    risk: entry.risk,
    requiresConfirmation: entry.requiresConfirmation,
    supportsBackground: true,
    supportsStreaming: false,
    plannerVisible: entry.plannerVisible,
    resultSchema: entry.resultSchema,
  };
}

export const CAPABILITY_REGISTRY: CapabilityDefinition[] =
  CAPABILITY_SOURCE.map(toDefinition);

const byId = new Map(CAPABILITY_REGISTRY.map((c) => [c.id, c]));
const byLegacyTool = new Map<string, CapabilityDefinition>();

for (const def of CAPABILITY_REGISTRY) {
  for (const p of def.providers) {
    byLegacyTool.set(p.legacyTool, def);
  }
}

export function getCapability(id: string): CapabilityDefinition | undefined {
  return byId.get(id);
}

export function listCapabilities(): CapabilityDefinition[] {
  return [...CAPABILITY_REGISTRY];
}

export function listPlannerCapabilities(): CapabilityDefinition[] {
  return CAPABILITY_REGISTRY.filter((c) => c.plannerVisible);
}

export function capabilityFromLegacyTool(toolName: string): CapabilityDefinition | undefined {
  return byLegacyTool.get(toolName);
}

export function resolveCapabilityExecution(
  capabilityId: string,
  providerId?: string
): ResolvedCapabilityExecution | undefined {
  const def = getCapability(capabilityId);
  if (!def || def.providers.length === 0) return undefined;

  let binding: ProviderBinding | undefined;
  if (providerId) {
    binding = def.providers.find((p) => p.providerId === providerId);
  }
  binding ??= def.providers[0];

  return {
    capabilityId: def.id,
    providerId: binding.providerId,
    legacyTool: binding.legacyTool,
    adapterAction: binding.adapterAction,
    domain: def.domain,
  };
}

export function capabilityToTool(capabilityId: string, providerId?: string): string | undefined {
  return resolveCapabilityExecution(capabilityId, providerId)?.legacyTool;
}

export function listCapabilitiesForProviders(activeProviderIds: string[]): CapabilityDefinition[] {
  const allowed = new Set(activeProviderIds);
  allowed.add('notes');
  return CAPABILITY_REGISTRY.filter(
    (def) =>
      def.plannerVisible && def.providers.some((p) => allowed.has(p.providerId) || p.providerId === 'notes')
  );
}
