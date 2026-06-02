export interface ModelInfo {
  id: string;
  label: string;
  provider?: string;
  tasks?: string[];
  tier?: number;
  available?: boolean;
}

export interface ModelsResponse {
  mode: 'auto';
  models: ModelInfo[];
  routing?: Record<string, string[]>;
  taskChains?: Record<string, string[]>;
  rag?: Record<string, unknown>;
  timeouts?: Record<string, number>;
  aiServiceUrl?: string;
}
