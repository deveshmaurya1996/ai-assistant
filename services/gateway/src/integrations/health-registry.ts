import type { ConnectionHealthAdapter, ConnectionHealthResult, HealthContext } from './types';

const adapters = new Map<string, ConnectionHealthAdapter>();

export function registerHealthAdapter(adapter: ConnectionHealthAdapter): void {
  adapters.set(adapter.providerId, adapter);
}

export async function assessProviderHealth(ctx: HealthContext): Promise<ConnectionHealthResult> {
  const adapter = adapters.get(ctx.connection.providerId);
  if (!adapter) {
    return { healthy: true };
  }
  return adapter.assess(ctx);
}
