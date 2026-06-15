import { PROVIDER_DEFS } from './provider-defs';
import { registerOAuthHealthAdapters } from './adapters/oauth-health.adapter';
import { registerWhatsAppHealthAdapter } from './adapters/whatsapp-health.adapter';
import { registerWhatsAppExecAdapter } from './adapters/whatsapp-exec.adapter';

let registered = false;

export function registerIntegrationAdapters(): void {
  if (registered) return;
  registered = true;

  const oauthProviderIds = Object.entries(PROVIDER_DEFS)
    .filter(([, def]) => def.authType === 'oauth2')
    .map(([providerId]) => providerId);
  registerOAuthHealthAdapters(oauthProviderIds);

  registerWhatsAppHealthAdapter();

  for (const [providerId, def] of Object.entries(PROVIDER_DEFS)) {
    if (def.gatewayExec && providerId === 'whatsapp') {
      registerWhatsAppExecAdapter();
    }
  }
}
