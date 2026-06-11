import { KNOWN_PROVIDER_IDS, PROVIDER_DISPLAY } from './generated/providers';
import { listCapabilitiesForProviders } from './registry';

export type ConnectedProviderInfo = {
  id: string;
  providerId: string;
  connectionId: string;
};

export type ConnectionStateKind = 'ready' | 'offline' | 'not_connected';

export type ProviderConnectionState = {
  providerId: string;
  state: ConnectionStateKind;
  connectionId?: string;
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

export { KNOWN_PROVIDER_IDS, PROVIDER_DISPLAY };

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
      .filter((p) => providerIds.includes(p.providerId))
      .map((p) => p.providerId),
  }));

  return { connectedProviders, capabilities };
}

export function formatManifestForPlanner(
  manifest: IntegrationManifest,
  options?: {
    supportedProviders?: string[];
    connectionStates?: ProviderConnectionState[];
  }
): string {
  const supported = options?.supportedProviders ?? [...KNOWN_PROVIDER_IDS];
  const states = options?.connectionStates ?? [];
  const supportedLine = supported
    .map((id) => PROVIDER_DISPLAY[id] ?? id)
    .join(', ');

  const ready = states.filter((s) => s.state === 'ready').map((s) => s.providerId);
  const offline = states.filter((s) => s.state === 'offline').map((s) => s.providerId);
  const notConnected = states.filter((s) => s.state === 'not_connected').map((s) => s.providerId);

  const lines: string[] = [`Supported integrations: ${supportedLine}.`];

  if (ready.length > 0) {
    lines.push(`Ready for AI: ${ready.join(', ')}.`);
  } else {
    lines.push('Ready for AI: none.');
  }

  if (notConnected.length > 0) {
    lines.push(`Not connected: ${notConnected.join(', ')} — open Connect Apps to link.`);
  }

  if (offline.length > 0) {
    lines.push(`Linked but offline: ${offline.join(', ')} — reconnect in Connect Apps.`);
  }

  if (manifest.connectedProviders.length === 0) {
    lines.push(
      '',
      'No integrations are ready right now. The user must connect apps in Connect Apps before the assistant can use them.'
    );
    return lines.join('\n');
  }

  lines.push(
    '',
    'Capabilities available for this user (use only these capability IDs when planning):'
  );

  for (const cap of manifest.capabilities) {
    const prov = cap.providers.length ? cap.providers.join(', ') : 'platform';
    const confirm = cap.requiresConfirmation ? '; requires user confirmation' : '';
    lines.push(`- ${cap.id}: ${cap.description} [via: ${prov}] (risk: ${cap.risk}${confirm})`);
  }

  return lines.join('\n');
}

export function capabilityIdsFromManifest(manifest: IntegrationManifest): string[] {
  return manifest.capabilities.map((c) => c.id);
}
