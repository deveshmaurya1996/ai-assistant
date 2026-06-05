import type { JsonObject } from './common';

export type AutomationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

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
  isActive?: boolean;
  query?: string;
  timezone?: string;
}

export interface RunAutomationResponse {
  success: boolean;
}
