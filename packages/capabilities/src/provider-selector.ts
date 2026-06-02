import { getCapability } from './registry';
import type { ConnectedProviderInput, ProviderChoice, UserPreferences } from './types';

export function selectProvider(
  capabilityId: string,
  connectedProviders: ConnectedProviderInput[],
  userPreferences?: UserPreferences
): ProviderChoice | null {
  const def = getCapability(capabilityId);
  if (!def) return null;

  const activeIds = new Set(connectedProviders.map((c) => c.providerId));
  const supported = def.providers.filter((p) => activeIds.has(p.providerId));
  if (supported.length === 0) return null;

  if (def.domain === 'messaging' && userPreferences?.preferredMessagingApp) {
    const pref = supported.find((p) => p.providerId === userPreferences.preferredMessagingApp);
    if (pref) {
      return {
        providerId: pref.providerId,
        adapterAction: pref.adapterAction,
        executionTool: pref.legacyTool,
      };
    }
  }

  if (def.domain === 'email' && userPreferences?.preferredEmailApp) {
    const pref = supported.find((p) => p.providerId === userPreferences.preferredEmailApp);
    if (pref) {
      return {
        providerId: pref.providerId,
        adapterAction: pref.adapterAction,
        executionTool: pref.legacyTool,
      };
    }
  }

  if (supported.length === 1) {
    const p = supported[0]!;
    return {
      providerId: p.providerId,
      adapterAction: p.adapterAction,
      executionTool: p.legacyTool,
    };
  }

  for (const conn of connectedProviders) {
    const match = supported.find((p) => p.providerId === conn.providerId);
    if (match) {
      return {
        providerId: match.providerId,
        adapterAction: match.adapterAction,
        executionTool: match.legacyTool,
      };
    }
  }

  const p = supported[0]!;
  return {
    providerId: p.providerId,
    adapterAction: p.adapterAction,
    executionTool: p.legacyTool,
  };
}
