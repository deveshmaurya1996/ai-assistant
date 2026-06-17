import type { CapabilitySourceEntry } from './generated/capability-source';
import { CAPABILITY_SOURCE } from './generated/capability-source';

export function catalogForAbstract(abstractCapability: string): CapabilitySourceEntry[] {
  return CAPABILITY_SOURCE.filter(
    (c) => c.abstractCapability === abstractCapability && c.plannerVisible
  ).sort((a, b) => (b.priority ?? 100) - (a.priority ?? 100));
}

export function resolveAbstractCapabilities(
  abstractCaps: string[],
  availableIds: Set<string>
): CapabilitySourceEntry[] {
  const out: CapabilitySourceEntry[] = [];
  const seen = new Set<string>();
  for (const abstract of abstractCaps) {
    for (const cap of catalogForAbstract(abstract)) {
      if (!availableIds.has(cap.id) || seen.has(cap.id)) continue;
      seen.add(cap.id);
      out.push(cap);
    }
  }
  return out;
}
