export type ProviderAuthType = 'oauth2' | 'device_link' | 'api_key';

export type IntegrationProviderDef = {
  name: string;
  authType: ProviderAuthType;
  scopes: string[];
  gatewayExec?: boolean;
};

export const PROVIDER_DEFS: Record<string, IntegrationProviderDef> = {
  google: {
    name: 'Google Workspace',
    authType: 'oauth2',
    scopes: ['gmail', 'calendar', 'drive'],
  },
  whatsapp: {
    name: 'WhatsApp',
    authType: 'device_link',
    scopes: ['messages'],
    gatewayExec: true,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDER_DEFS) as Array<keyof typeof PROVIDER_DEFS>;

export function getProviderDef(providerId: string): IntegrationProviderDef | undefined {
  return PROVIDER_DEFS[providerId];
}
