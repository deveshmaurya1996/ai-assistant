import { listCapabilitiesForProviders } from './registry';
import type { CapabilityDefinition } from './types';

export type ConnectedProviderInfo = {
  id: string;
  providerId: string;
  connectionId: string;
};

export type IntegrationManifest = {
  connectedProviders: ConnectedProviderInfo[];
  capabilities: Array<{
    id: string;
    description: string;
    risk: string;
    requiresConfirmation: boolean;
    providers: string[];
  }>;
};

export function buildIntegrationManifest(
  connections: Array<{ id: string; providerId: string }>
): IntegrationManifest {
  const connectedProviders: ConnectedProviderInfo[] = connections.map((c) => ({
    id: c.providerId,
    providerId: c.providerId,
    connectionId: c.id,
  }));

  const providerIds = connections.map((c) => c.providerId);
  const capabilityDefs = listCapabilitiesForProviders(providerIds);

  const capabilities = capabilityDefs.map((def) => ({
    id: def.id,
    description: def.description,
    risk: def.risk,
    requiresConfirmation: def.requiresConfirmation,
    providers: def.providers
      .filter((p) => providerIds.includes(p.providerId) || p.providerId === 'notes')
      .map((p) => p.providerId),
  }));

  return { connectedProviders, capabilities };
}

export function formatManifestForPlanner(manifest: IntegrationManifest): string {
  if (manifest.connectedProviders.length === 0) {
    return (
      'Connected apps: none. The user must open Connect Apps and link Google, WhatsApp, or Files ' +
      'before the assistant can use those services.'
    );
  }

  const providerNames = manifest.connectedProviders.map((p) => p.providerId).join(', ');
  const lines: string[] = [
    `Connected apps (ACTIVE): ${providerNames}.`,
    '',
    'Capabilities available for this user (use only these capability IDs when planning):',
  ];

  for (const cap of manifest.capabilities) {
    const prov = cap.providers.length ? cap.providers.join(', ') : 'notes';
    const confirm = cap.requiresConfirmation ? '; requires user confirmation' : '';
    lines.push(`- ${cap.id}: ${cap.description} [via: ${prov}] (risk: ${cap.risk}${confirm})`);
  }

  return lines.join('\n');
}

export function capabilityIdsFromManifest(manifest: IntegrationManifest): string[] {
  return manifest.capabilities.map((c) => c.id);
}
