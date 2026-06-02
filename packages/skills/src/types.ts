export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  connector: string;
  capabilities: string[];
  description?: string;
}

export interface SkillDefinition {
  manifest: SkillManifest;
  skillMd: string;
  directory: string;
}

export interface SkillCatalogEntry {
  id: string;
  name: string;
  version: string;
  connector: string;
  capabilities: string[];
  description?: string;
  skillMd: string;
}

export interface ParsedCliCommand {
  capabilityId: string;
  providerId?: string;
  args: Record<string, string>;
}
