import type { JsonObject } from './common';

export type MemoryType =
  | 'PREFERENCE'
  | 'FACT'
  | 'CONVERSATION'
  | 'TASK'
  | 'BEHAVIOR';

export interface MemoryItem {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  metadata: JsonObject | null;
  embeddingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemorySearchResponse {
  success: boolean;
  results: unknown[];
}

export type UserPreferences = JsonObject;
