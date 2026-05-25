export const EventNames = {
  CHAT_STARTED: 'chat.started',
  AGENT_EXECUTED: 'agent.executed',
  VOICE_STREAM: 'voice.stream',
  MEMORY_SAVED: 'memory.saved',
} as const;

export type EventName = (typeof EventNames)[keyof typeof EventNames];

export const EVENTS_CHANNEL = 'ai-assistant:events';
