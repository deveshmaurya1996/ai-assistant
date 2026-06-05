import type { JsonObject } from './common';
import type {
  Capability,
  ConnectChallengeType,
  ConnectionStatus,
  ToolExecutionStatus,
  ToolSource,
} from './tool';

export type {
  Capability,
  ConnectChallengeType,
  ConnectionStatus,
  ToolExecutionStatus,
  ToolSource,
};

export interface IntegrationProvider {
  id: string;
  name: string;
  authType: string;
  scopes: string[];
  isEnabled: boolean;
}

export interface UserConnection {
  id: string;
  providerId: string;
  status: ConnectionStatus;
  scopes: string[];
  lastSyncAt: string | null;
  expiresAt: string | null;
  provider?: IntegrationProvider;
}

export interface ConnectChallenge {
  type: ConnectChallengeType;
  url?: string;
  qrData?: string;
  pairingCode?: string;
  state: string;
  connectionId?: string;
  bridgeSessionId?: string;
}

export interface WhatsAppSessionStatus {
  sessionId?: string;
  connectionId?: string;
  status: 'pending' | 'active' | 'disconnected';
  qrData?: string;
  pairingCode?: string;
  pairingPhone?: string;
  updatedAt?: string;
}

export interface ToolExecutionResult {
  executionId: string;
  status: ToolExecutionStatus | string;
  tool: string;
  requiresConfirmation?: boolean;
  result?: unknown;
  error?: string;
}

export interface WorkflowAction {
  connector: string;
  tool: string;
  args: JsonObject;
  onError?: 'fail' | 'skip' | 'retry';
}

export interface Workflow {
  id: string;
  userId: string;
  name: string;
  trigger: JsonObject;
  conditions: JsonObject[];
  actions: WorkflowAction[];
  retries?: JsonObject;
  rollback?: WorkflowAction[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  runs?: WorkflowRun[];
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  steps?: unknown;
  error?: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface CreateWorkflowInput {
  name: string;
  trigger: JsonObject;
  conditions?: JsonObject[];
  actions: WorkflowAction[];
  retries?: JsonObject;
  rollback?: WorkflowAction[];
  isActive?: boolean;
}

export type ReminderRecurrence =
  | 'NONE'
  | 'HOURLY'
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'CUSTOM';

export type ReminderStatus =
  | 'PENDING'
  | 'PAUSED'
  | 'FIRED'
  | 'CANCELLED'
  | 'FAILED';

export interface Reminder {
  id: string;
  userId: string;
  payload: JsonObject;
  userPrompt?: string | null;
  recurrence: ReminderRecurrence;
  cronExpression?: string | null;
  timezone: string;
  nextFireAt: string;
  lastFiredAt?: string | null;
  status: ReminderStatus;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateReminderInput {
  title: string;
  body?: string;
  userPrompt?: string;
  recurrence?: ReminderRecurrence;
  cronExpression?: string;
  timezone?: string;
  nextFireAt: string;
  action?: JsonObject;
}

export interface UpdateReminderInput {
  title?: string;
  body?: string;
  userPrompt?: string;
  recurrence?: ReminderRecurrence;
  cronExpression?: string | null;
  timezone?: string;
  nextFireAt?: string;
  status?: ReminderStatus;
}

export interface DevicePushTokenInput {
  token: string;
  platform: 'ios' | 'android';
  deviceId?: string;
  prefs?: { reminderOverlayEnabled?: boolean };
}

export interface FileAsset {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  checksum?: string | null;
  indexedAt?: string | null;
  createdAt: string;
}

export interface IntegrationProvidersResponse {
  providers: IntegrationProvider[];
  connectors: Array<{ providerId: string; capabilities: Capability[] }>;
}

export interface IntegrationSearchResult {
  id: string;
  connectionId: string;
  provider: string;
  resourceType: string;
  externalId: string;
  title: string | null;
  snippet: string | null;
  mimeType: string | null;
  url: string | null;
  modifiedAt: string | null;
}
