/**
 * NATS JetStream adapter (Phase 2b).
 * Set EVENT_BUS_BACKEND=nats and NATS_URL to enable.
 * Default remains Redis via redis-bus.ts.
 */

export type NatsBusConfig = {
  url: string;
  streamName?: string;
};

export function isNatsBusEnabled(): boolean {
  return process.env.EVENT_BUS_BACKEND === 'nats';
}

export async function publishNatsEvent(
  _name: string,
  _payload: Record<string, unknown>
): Promise<void> {
  throw new Error(
    'NATS adapter not installed. Add nats package and implement publishNatsEvent.'
  );
}
