import type {
  Capability,
  ConnectChallenge,
  ToolSource,
} from '@ai-assistant/types';

export type { Capability, ConnectChallenge, ToolSource };

export type JsonObject = Record<string, unknown>;

export interface ExecutionContext {
  userId: string;
  connectionId: string;
  chatSessionId?: string;
  source: ToolSource;
  confirmed: boolean;
  executionId: string;
  signal?: AbortSignal;
}

export interface ToolChunk {
  type: 'progress' | 'chunk' | 'complete' | 'error';
  message?: string;
  data?: unknown;
  progress?: number;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ConnectionMeta {
  connectionId: string;
  providerId: string;
  status: 'active' | 'pending' | 'error';
  scopes?: string[];
  credentials?: JsonObject;
}

export interface HealthStatus {
  healthy: boolean;
  message?: string;
}

export interface SyncResult {
  resourcesIndexed: number;
  cursor?: string;
}

export interface IntegrationConnector {
  providerId: string;
  capabilities: Capability[];
  getConnectUrl?(userId: string, state: string): Promise<ConnectChallenge>;
  handleCallback?(userId: string, payload: unknown): Promise<ConnectionMeta>;
  refreshTokens?(connectionId: string, credentials: JsonObject): Promise<JsonObject>;
  disconnect?(connectionId: string): Promise<void>;
  healthCheck?(connectionId: string, credentials: JsonObject): Promise<HealthStatus>;
  executeTool(
    connectionId: string,
    tool: string,
    args: JsonObject,
    ctx: ExecutionContext,
    credentials: JsonObject
  ): Promise<ToolResult> | AsyncGenerator<ToolChunk, ToolResult>;
  sync?(connectionId: string, credentials: JsonObject, cursor?: string): Promise<SyncResult>;
}
