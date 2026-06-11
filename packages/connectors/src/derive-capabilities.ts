import { listPlannerCapabilities } from '@ai-assistant/capabilities';
import type { ConnectorMeta } from './types';

export function deriveConnectorCapabilities(meta: ConnectorMeta): string[] {
  if (meta.capabilityIds?.length) {
    return [...meta.capabilityIds];
  }

  const providerSet = new Set(meta.providerIds);
  const domainSet = new Set(meta.domains);

  return listPlannerCapabilities()
    .filter((cap) => {
      if (!domainSet.has(cap.domain)) return false;
      return cap.providers.some((p) => providerSet.has(p.providerId));
    })
    .map((cap) => cap.id)
    .sort();
}
