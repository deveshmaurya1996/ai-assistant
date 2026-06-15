export interface ModelUiInfo {
  selectable?: boolean;
  featured?: boolean;
}

export type ModelHealthState = 'warming' | 'healthy' | 'degraded' | 'open' | 'quarantined';

export interface ModelInfo {
  id: string;
  label: string;
  provider?: string;
  tasks?: string[];
  tier?: number | string;
  available?: boolean;
  configured?: boolean;
  operational?: boolean;
  priority?: number;
  rankScore?: number | null;
  routerEligible?: boolean;
  costClass?: 'cheap' | 'medium' | 'expensive';
  state?: ModelHealthState;
  ui?: ModelUiInfo;
  recommended?: boolean;
  successRate1h?: number | null;
  p95Latency1h?: number | null;
  sampleCount1h?: number;
}

export interface ModelsResponse {
  mode: 'auto' | 'manual';
  models: ModelInfo[];
  task?: string;
  recommendedModelId?: string | null;
  primaryFromRedis?: string | null;
  preferredModelId?: string | null;
  routingOrder?: string[];
  routing?: Record<string, string[]>;
  taskChains?: Record<string, string[]>;
  rag?: Record<string, unknown>;
  timeouts?: Record<string, number>;
  aiServiceUrl?: string;
  updatedAt?: number;
}
