
export const EVENTS_CHANNEL = 'ai-assistant:events';

export const EVENTS_STREAM_KEY = 'ai-assistant:events:stream';

export const EventNames = {
  // Legacy
  CHAT_STARTED: 'chat.started',
  AGENT_EXECUTED: 'agent.executed',
  VOICE_STREAM: 'voice.stream',
  MEMORY_SAVED: 'memory.saved',

  // Tool lifecycle
  TOOL_CALLED: 'tool.called',
  TOOL_PROGRESS: 'tool.progress',
  TOOL_COMPLETED: 'tool.completed',
  TOOL_FAILED: 'tool.failed',
  TOOL_CANCELLED: 'tool.cancelled',

  // Automation / workflow
  AUTOMATION_STARTED: 'automation.started',
  AUTOMATION_COMPLETED: 'automation.completed',
  WORKFLOW_STEP_COMPLETED: 'workflow.step.completed',
  WORKFLOW_FAILED: 'workflow.failed',

  // Voice / realtime
  VOICE_STARTED: 'voice.started',
  VOICE_INTERRUPTED: 'voice.interrupted',
  VOICE_STATE_CHANGED: 'voice.state.changed',

  // Integrations
  INTEGRATION_CONNECTED: 'integration.connected',
  INTEGRATION_SYNCED: 'integration.synced',
  INTEGRATION_DISCONNECTED: 'integration.disconnected',
  MESSAGE_RECEIVED: 'message.received',

  // Memory / notifications
  MEMORY_UPDATED: 'memory.updated',
  NOTIFICATION_CREATED: 'notification.created',
} as const;

export type EventName = (typeof EventNames)[keyof typeof EventNames];
