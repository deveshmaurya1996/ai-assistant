export interface ModelInfo {
  id: string;
  label: string;
  provider?: string;
  role?: 'primary' | 'fallback';
  available?: boolean;
}

export interface CapabilityModels {
  label: string;
  primary: string;
  fallback: string | null;
  chain: string[];
  models: ModelInfo[];
}

export interface ModelsResponse {
  models: ModelInfo[];
  primary: string;
  fallback: string;
  capabilities?: Record<string, CapabilityModels>;
  text?: CapabilityModels;
  aiServiceUrl?: string;
}

export interface PreferredModelUpdate {
  preferredModel: string;
}
