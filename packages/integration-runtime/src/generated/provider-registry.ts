/** AUTO-GENERATED from catalog/*.yaml — do not edit by hand. Run: pnpm catalog:generate */

import type { IntegrationConnector } from '../types';
import { GoogleConnector } from '../google';
import { WhatsAppConnector } from '../whatsapp';

export const CONNECTOR_IMPLEMENTATIONS: IntegrationConnector[] = [
  new GoogleConnector(),
  new WhatsAppConnector(),
];

export function registerProviderNamespaces(
  toolNamespaceToProvider: Map<string, string>
): void {
  toolNamespaceToProvider.set('gmail', 'google');
  toolNamespaceToProvider.set('calendar', 'google');
  toolNamespaceToProvider.set('email', 'google');
  toolNamespaceToProvider.set('drive', 'google');
  toolNamespaceToProvider.set('whatsapp', 'whatsapp');
  toolNamespaceToProvider.set('messaging', 'whatsapp');
}
