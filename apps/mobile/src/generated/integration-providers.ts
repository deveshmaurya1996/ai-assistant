/** AUTO-GENERATED from catalog/*.yaml — do not edit by hand. Run: pnpm catalog:generate */

export type CatalogIntegrationProvider = {
  id: string;
  name: string;
  description: string;
  authType: string;
};

export const CATALOG_INTEGRATION_PROVIDERS: CatalogIntegrationProvider[] = [
  {
    "id": "google",
    "name": "Google Workspace",
    "description": "Grant Gmail, Calendar & Drive access",
    "authType": "oauth2"
  },
  {
    "id": "whatsapp",
    "name": "WhatsApp",
    "description": "Linked device messages",
    "authType": "device_link"
  }
];
