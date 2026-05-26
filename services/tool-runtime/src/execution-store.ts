import type { ToolSource } from '@ai-assistant/types';

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ExecutionRecord {
  executionId: string;
  userId: string;
  tool: string;
  connector: string;
  args: Record<string, unknown>;
  source: ToolSource;
  confirmed: boolean;
  connectionId?: string;
  chatSessionId?: string;
  status: ExecutionStatus;
  result?: unknown;
  error?: string;
  progress?: number;
  progressMessage?: string;
  supportsCancellation: boolean;
  abortController: AbortController;
  createdAt: string;
}

const executions = new Map<string, ExecutionRecord>();

export function createExecution(record: Omit<ExecutionRecord, 'abortController' | 'createdAt' | 'status'>): ExecutionRecord {
  const full: ExecutionRecord = {
    ...record,
    status: 'pending',
    abortController: new AbortController(),
    createdAt: new Date().toISOString(),
  };
  executions.set(record.executionId, full);
  return full;
}

export function getExecution(executionId: string): ExecutionRecord | undefined {
  return executions.get(executionId);
}

export function updateExecution(
  executionId: string,
  patch: Partial<Pick<ExecutionRecord, 'status' | 'result' | 'error' | 'progress' | 'progressMessage'>>
): ExecutionRecord | undefined {
  const existing = executions.get(executionId);
  if (!existing) return undefined;
  Object.assign(existing, patch);
  return existing;
}

export function cancelExecution(executionId: string): boolean {
  const existing = executions.get(executionId);
  if (!existing || !existing.supportsCancellation) return false;
  if (['completed', 'failed', 'cancelled'].includes(existing.status)) return false;
  existing.abortController.abort();
  existing.status = 'cancelled';
  return true;
}
