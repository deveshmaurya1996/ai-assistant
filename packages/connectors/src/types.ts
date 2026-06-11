export type ConnectorMeta = {
  id: string;
  name: string;
  version: string;
  providerIds: string[];
  domains: string[];
  description?: string;
  capabilityIds?: string[];
  alwaysInclude?: boolean;
  implementation?: string;
  integrationModule?: string | null;
};

export type ConnectorManifest = ConnectorMeta & {
  capabilities: string[];
};

export type ConnectorDefinition = {
  manifest: ConnectorManifest;
  playbookMd: string;
  directory: string;
};

export type ConnectorCatalogEntry = {
  id: string;
  name: string;
  version: string;
  providerIds: string[];
  domains: string[];
  capabilities: string[];
  description?: string;
  playbookMd: string;
  alwaysInclude?: boolean;
};
