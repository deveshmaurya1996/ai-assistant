export type GoogleIntegrationConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiBase: string;
};

export function resolveGoogleIntegrationConfig(): GoogleIntegrationConfig {
  const clientId =
    process.env.GOOGLE_INTEGRATION_CLIENT_ID?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    '';
  const clientSecret =
    process.env.GOOGLE_INTEGRATION_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    '';
  const apiBase = (
    process.env.API_PUBLIC_URL?.trim() ||
    process.env.GATEWAY_URL?.trim() ||
    `http://localhost:${process.env.API_PORT ?? '3000'}`
  ).replace(/\/$/, '');
  const redirectUri = (
    process.env.GOOGLE_INTEGRATION_REDIRECT_URI?.trim() ||
    `${apiBase}/integrations/google/callback`
  ).replace(/\/$/, '');

  return { clientId, clientSecret, redirectUri, apiBase };
}

export function assertGoogleIntegrationConfigured(): GoogleIntegrationConfig {
  const config = resolveGoogleIntegrationConfig();
  if (!config.clientId) {
    throw new Error(
      'Google integration is not configured. Set GOOGLE_INTEGRATION_CLIENT_ID (or GOOGLE_CLIENT_ID) and register the redirect URI in Google Cloud Console.'
    );
  }
  if (!config.clientSecret) {
    throw new Error(
      'Google integration is not configured. Set GOOGLE_INTEGRATION_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET).'
    );
  }
  return config;
}

export function integrationsDeepLink(query: Record<string, string>): string {
  const base = (process.env.MOBILE_DEEP_LINK ?? 'ai-assistant://integrations').replace(/\/$/, '');
  const params = new URLSearchParams(query);
  const qs = params.toString();
  if (!qs) return base;
  return base.includes('?') ? `${base}&${qs}` : `${base}?${qs}`;
}
