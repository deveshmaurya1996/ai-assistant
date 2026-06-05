import { z } from 'zod';
import { EventNames, type EventName } from './names';

export const ChatStartedPayloadSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  source: z.enum(['socket', 'http']).optional(),
});

export const AgentExecutedPayloadSchema = z.object({
  userId: z.string(),
  agentId: z.string(),
  status: z.enum(['started', 'completed', 'failed']),
});

export const VoiceStreamPayloadSchema = z.object({
  userId: z.string(),
  sessionId: z.string().optional(),
  bytes: z.number().optional(),
});

export const MemorySavedPayloadSchema = z.object({
  userId: z.string(),
  memoryItemId: z.string().optional(),
  type: z.string(),
});

export const ToolEventPayloadSchema = z.object({
  userId: z.string(),
  executionId: z.string(),
  tool: z.string(),
  connector: z.string().optional(),
  status: z.enum(['started', 'progress', 'completed', 'failed', 'cancelled']).optional(),
  progress: z.number().optional(),
  message: z.string().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  source: z.enum(['chat', 'voice', 'automation', 'workflow', 'manual']).optional(),
});

export const AutomationEventPayloadSchema = z.object({
  userId: z.string(),
  automationId: z.string(),
  runId: z.string().optional(),
  status: z.enum(['started', 'completed', 'failed']),
  error: z.string().optional(),
});

export const WorkflowEventPayloadSchema = z.object({
  userId: z.string(),
  workflowId: z.string(),
  runId: z.string(),
  stepIndex: z.number().optional(),
  status: z.enum(['step_completed', 'failed']),
  error: z.string().optional(),
});

export const VoiceStatePayloadSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  state: z.enum([
    'IDLE',
    'LISTENING',
    'PROCESSING',
    'CONFIRMING',
    'EXECUTING',
    'SPEAKING',
    'INTERRUPTED',
    'ERROR',
  ]),
  executionId: z.string().optional(),
});

export const IntegrationEventPayloadSchema = z.object({
  userId: z.string(),
  connectionId: z.string(),
  providerId: z.string(),
  status: z.enum(['connected', 'synced', 'disconnected']).optional(),
  resourceCount: z.number().optional(),
});

export const MessageReceivedPayloadSchema = z.object({
  userId: z.string(),
  connectionId: z.string(),
  providerId: z.string(),
  externalId: z.string(),
  subject: z.string().optional(),
  snippet: z.string().optional(),
});

export const MemoryUpdatedPayloadSchema = z.object({
  userId: z.string(),
  memoryType: z.enum(['episodic', 'semantic', 'procedural', 'working']),
  memoryItemId: z.string().optional(),
});

export const NotificationCreatedPayloadSchema = z.object({
  userId: z.string(),
  title: z.string(),
  body: z.string().optional(),
  type: z.string().optional(),
  reminderId: z.string().optional(),
  missed: z.boolean().optional(),
});

/** Generic payload for proactive OS events (Phase 2). */
export const OsEventPayloadSchema = z.object({
  userId: z.string(),
  source: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ChatStartedPayload = z.infer<typeof ChatStartedPayloadSchema>;
export type AgentExecutedPayload = z.infer<typeof AgentExecutedPayloadSchema>;
export type VoiceStreamPayload = z.infer<typeof VoiceStreamPayloadSchema>;
export type MemorySavedPayload = z.infer<typeof MemorySavedPayloadSchema>;
export type ToolEventPayload = z.infer<typeof ToolEventPayloadSchema>;
export type AutomationEventPayload = z.infer<typeof AutomationEventPayloadSchema>;
export type WorkflowEventPayload = z.infer<typeof WorkflowEventPayloadSchema>;
export type VoiceStatePayload = z.infer<typeof VoiceStatePayloadSchema>;
export type IntegrationEventPayload = z.infer<typeof IntegrationEventPayloadSchema>;
export type MessageReceivedPayload = z.infer<typeof MessageReceivedPayloadSchema>;
export type MemoryUpdatedPayload = z.infer<typeof MemoryUpdatedPayloadSchema>;
export type NotificationCreatedPayload = z.infer<
  typeof NotificationCreatedPayloadSchema
>;
export type OsEventPayload = z.infer<typeof OsEventPayloadSchema>;

export const eventPayloadSchemas: Record<EventName, z.ZodTypeAny> = {
  [EventNames.CHAT_STARTED]: ChatStartedPayloadSchema,
  [EventNames.AGENT_EXECUTED]: AgentExecutedPayloadSchema,
  [EventNames.VOICE_STREAM]: VoiceStreamPayloadSchema,
  [EventNames.MEMORY_SAVED]: MemorySavedPayloadSchema,
  [EventNames.TOOL_CALLED]: ToolEventPayloadSchema,
  [EventNames.TOOL_PROGRESS]: ToolEventPayloadSchema,
  [EventNames.TOOL_COMPLETED]: ToolEventPayloadSchema,
  [EventNames.TOOL_FAILED]: ToolEventPayloadSchema,
  [EventNames.TOOL_CANCELLED]: ToolEventPayloadSchema,
  [EventNames.AUTOMATION_STARTED]: AutomationEventPayloadSchema,
  [EventNames.AUTOMATION_COMPLETED]: AutomationEventPayloadSchema,
  [EventNames.WORKFLOW_STEP_COMPLETED]: WorkflowEventPayloadSchema,
  [EventNames.WORKFLOW_FAILED]: WorkflowEventPayloadSchema,
  [EventNames.VOICE_STARTED]: VoiceStatePayloadSchema,
  [EventNames.VOICE_INTERRUPTED]: VoiceStatePayloadSchema,
  [EventNames.VOICE_STATE_CHANGED]: VoiceStatePayloadSchema,
  [EventNames.INTEGRATION_CONNECTED]: IntegrationEventPayloadSchema,
  [EventNames.INTEGRATION_SYNCED]: IntegrationEventPayloadSchema,
  [EventNames.INTEGRATION_DISCONNECTED]: IntegrationEventPayloadSchema,
  [EventNames.MESSAGE_RECEIVED]: MessageReceivedPayloadSchema,
  [EventNames.MEMORY_UPDATED]: MemoryUpdatedPayloadSchema,
  [EventNames.NOTIFICATION_CREATED]: NotificationCreatedPayloadSchema,
  [EventNames.EMAIL_RECEIVED]: OsEventPayloadSchema,
  [EventNames.MEETING_STARTED]: OsEventPayloadSchema,
  [EventNames.MEETING_ENDED]: OsEventPayloadSchema,
  [EventNames.DEVICE_BATTERY_LOW]: OsEventPayloadSchema,
  [EventNames.USER_DRIVING]: OsEventPayloadSchema,
  [EventNames.PERMISSION_REVOKED]: OsEventPayloadSchema,
  [EventNames.TASK_COMPLETED]: OsEventPayloadSchema,
  [EventNames.HEADPHONES_CONNECTED]: OsEventPayloadSchema,
};
