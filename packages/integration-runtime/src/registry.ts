import { getToolDefinition } from '@ai-assistant/tool-schema';
import type { IntegrationConnector } from './types';
import {
  CONNECTOR_IMPLEMENTATIONS,
  registerProviderNamespaces,
} from './generated/provider-registry';

const connectors = new Map<string, IntegrationConnector>();
const toolNamespaceToProvider = new Map<string, string>();

for (const connector of CONNECTOR_IMPLEMENTATIONS) {
  connectors.set(connector.providerId, connector);
}
registerProviderNamespaces(toolNamespaceToProvider);

export function getConnector(providerId: string): IntegrationConnector | undefined {
  return connectors.get(providerId);
}

export function listConnectors(): IntegrationConnector[] {
  return Array.from(connectors.values());
}

export function getConnectorForTool(toolName: string): IntegrationConnector | undefined {
  const schemaConnector = getToolDefinition(toolName)?.connector;
  if (schemaConnector && schemaConnector !== 'platform') {
    return connectors.get(schemaConnector);
  }
  const namespace = toolName.split('.')[0];
  const providerId = toolNamespaceToProvider.get(namespace);
  return providerId ? connectors.get(providerId) : undefined;
}
