import type { JsonObject } from './common';

export type AgentType = 'email' | 'calendar' | 'browser';

export interface AgentConfig {
  id: string;
  userId: string;
  agentType: AgentType;
  credentials: JsonObject;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAgentConfigInput {
  agentType: AgentType;
  credentials?: JsonObject;
  isActive?: boolean;
}

export interface AgentRunInput {
  agentType: AgentType;
  task: string;
  context?: JsonObject;
}
