import { resolveBridgeSessionForUser } from '../../whatsapp/session-resolve';
import { sessionManager } from '../../whatsapp/session-manager';
import type { ConnectionHealthAdapter, ConnectionHealthResult, HealthContext } from '../types';
import { registerHealthAdapter } from '../health-registry';

const whatsappHealthAdapter: ConnectionHealthAdapter = {
  providerId: 'whatsapp',
  async assess(ctx: HealthContext): Promise<ConnectionHealthResult> {
    const resolved = await resolveBridgeSessionForUser(ctx.userId, ctx.connection.id);
    if (!resolved) {
      return {
        healthy: false,
        error: 'WhatsApp session offline — open Connect Apps and reconnect.',
      };
    }

    const bootstrapped = await sessionManager.bootstrapActiveSession(resolved.sessionId);
    if (bootstrapped || sessionManager.getConnectionPhase(resolved.sessionId) === 'open') {
      return { healthy: true };
    }

    return {
      healthy: false,
      error: 'WhatsApp session offline — ensure your phone is online and retry.',
    };
  },
};

export function registerWhatsAppHealthAdapter(): void {
  registerHealthAdapter(whatsappHealthAdapter);
}
