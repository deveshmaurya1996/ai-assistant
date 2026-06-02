export type RiskLevel = 'low' | 'medium' | 'high';

export interface ProviderBinding {
  providerId: string;
  legacyTool: string;
  adapterAction: string;
}

export interface CapabilityDefinition {
  id: string;
  domain: string;
  description: string;
  providers: ProviderBinding[];
  permissions: string[];
  risk: RiskLevel;
  requiresConfirmation: boolean;
  supportsBackground: boolean;
  supportsStreaming: boolean;
  plannerVisible: boolean;
  resultSchema: string;
}

export interface ResolvedCapabilityExecution {
  capabilityId: string;
  providerId: string;
  legacyTool: string;
  adapterAction: string;
  domain: string;
}

export interface ConnectedProviderInput {
  id: string;
  providerId: string;
}

export interface UserPreferences {
  preferredMessagingApp?: string;
  preferredEmailApp?: string;
}

export interface ProviderChoice {
  providerId: string;
  adapterAction: string;
  executionTool: string;
}
