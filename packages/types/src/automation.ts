import type { JsonObject } from './common';

export type AutomationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type AutomationActionType = 'agent_digest' | 'tool_execution';

export interface AgentDigestAction {
  type: 'agent_digest';
  query: string;
  pushTitle?: string;
  timezone?: string;
  userPrompt?: string;
}

export interface ToolExecutionAction {
  type?: 'tool_execution';
  tool: string;
  args?: JsonObject;
  connector?: string;
}

export type AutomationAction = AgentDigestAction | ToolExecutionAction;

export interface CronTrigger {
  type: 'cron';
}

export interface AgentDigestRunResult {
  type: 'agent_digest';
  summary: string;
  at: string;
}

export interface InboxDigestPushData {
  type: 'inbox_digest';
  automationId: string;
  sessionId: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  status: AutomationStatus;
  result: JsonObject | null;
  startedAt: string;
  completedAt: string | null;
}

export interface Automation {
  id: string;
  userId: string;
  name: string;
  trigger: JsonObject;
  action: JsonObject;
  schedule: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  scheduleLabel?: string | null;
  runs?: AutomationRun[];
}

export interface CreateAutomationInput {
  name: string;
  trigger: JsonObject;
  action: JsonObject;
  schedule?: string;
  isActive?: boolean;
}

export interface UpdateAutomationInput {
  name?: string;
  schedule?: string;
  cronExpression?: string;
  isActive?: boolean;
  query?: string;
  timezone?: string;
}

export interface RunAutomationResponse {
  success: boolean;
}
