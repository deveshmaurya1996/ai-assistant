import { z } from 'zod';
import { EventNames } from './names';

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

export type ChatStartedPayload = z.infer<typeof ChatStartedPayloadSchema>;
export type AgentExecutedPayload = z.infer<typeof AgentExecutedPayloadSchema>;
export type VoiceStreamPayload = z.infer<typeof VoiceStreamPayloadSchema>;
export type MemorySavedPayload = z.infer<typeof MemorySavedPayloadSchema>;

export const eventPayloadSchemas = {
  [EventNames.CHAT_STARTED]: ChatStartedPayloadSchema,
  [EventNames.AGENT_EXECUTED]: AgentExecutedPayloadSchema,
  [EventNames.VOICE_STREAM]: VoiceStreamPayloadSchema,
  [EventNames.MEMORY_SAVED]: MemorySavedPayloadSchema,
} as const;
