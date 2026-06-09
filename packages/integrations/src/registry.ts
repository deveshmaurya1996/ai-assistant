import { getToolDefinition } from '@ai-assistant/tool-schema';
import type { IntegrationConnector } from './types';
import { GoogleConnector, GOOGLE_TOOL_NAMESPACES } from './google';
import { WhatsAppConnector, WHATSAPP_TOOL_NAMESPACES } from './whatsapp';
import { FilesConnector, FILES_TOOL_NAMESPACES } from './files';

const connectors = new Map<string, IntegrationConnector>();
const toolNamespaceToProvider = new Map<string, string>();

function register(connector: IntegrationConnector) {
  connectors.set(connector.providerId, connector);
}

register(new GoogleConnector());
register(new WhatsAppConnector());
register(new FilesConnector());
for (const ns of GOOGLE_TOOL_NAMESPACES) toolNamespaceToProvider.set(ns, 'google');
for (const ns of WHATSAPP_TOOL_NAMESPACES) toolNamespaceToProvider.set(ns, 'whatsapp');
for (const ns of FILES_TOOL_NAMESPACES) toolNamespaceToProvider.set(ns, 'files');
toolNamespaceToProvider.set('notes', 'notes');
toolNamespaceToProvider.set('email', 'google');
toolNamespaceToProvider.set('messaging', 'whatsapp');

export function getConnector(providerId: string): IntegrationConnector | undefined {
  return connectors.get(providerId);
}

export function listConnectors(): IntegrationConnector[] {
  return Array.from(connectors.values());
}

export function getConnectorForTool(toolName: string): IntegrationConnector | undefined {
  const schemaConnector = getToolDefinition(toolName)?.connector;
  if (schemaConnector && schemaConnector !== 'platform' && schemaConnector !== 'notes') {
    return connectors.get(schemaConnector);
  }
  const namespace = toolName.split('.')[0];
  const providerId = toolNamespaceToProvider.get(namespace);
  return providerId ? connectors.get(providerId) : undefined;
}
