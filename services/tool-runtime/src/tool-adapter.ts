import { prisma } from '@ai-assistant/database';
import { listAllToolsOpenAi, listToolsForUserOpenAi } from '@ai-assistant/tool-schema';
import {
  ExecuteSchema,
  toStartExecutionInput,
  type ExecuteBody,
} from './routes';
import { startExecution } from './executor';
import { cancelExecution, getExecution } from './execution-store';

export interface ToolsAvailableResult {
  tools: ReturnType<typeof listAllToolsOpenAi>;
  connections: Array<{ id: string; providerId: string; metadata: unknown }>;
}

export interface ExecutionStartResult {
  status: number;
  body: Record<string, unknown>;
}

export interface ToolRuntimeAdapter {
  getToolsAvailable(userId?: string): Promise<ToolsAvailableResult>;
  startExecution(body: ExecuteBody): Promise<ExecutionStartResult>;
  getExecution(id: string): Promise<ReturnType<typeof getExecution>>;
  cancelExecution(id: string): Promise<boolean>;
}

export function createInProcessToolAdapter(): ToolRuntimeAdapter {
  return {
    async getToolsAvailable(userId?: string): Promise<ToolsAvailableResult> {
      if (!userId) {
        return { tools: listAllToolsOpenAi(), connections: [] };
      }
      const connections = await prisma.userConnection.findMany({
        where: { userId, status: 'ACTIVE' },
      });
      return {
        tools: listToolsForUserOpenAi(connections.map((c) => c.providerId)),
        connections: connections.map((c) => ({
          id: c.id,
          providerId: c.providerId,
          metadata: c.metadata,
        })),
      };
    },

    async startExecution(body: ExecuteBody): Promise<ExecutionStartResult> {
      const parsed = ExecuteSchema.parse(body);
      try {
        const record = await startExecution(toStartExecutionInput(parsed));
        return {
          status: 201,
          body: {
            executionId: record.executionId,
            status: record.status,
            tool: record.tool,
            requiresConfirmation: !parsed.confirmed && !parsed.preview,
          },
        };
      } catch (err) {
        const e = err as Error & { requiresConfirmation?: boolean };
        return {
          status: e.requiresConfirmation ? 428 : 400,
          body: {
            error: e.message,
            requiresConfirmation: e.requiresConfirmation,
          },
        };
      }
    },

    async getExecution(id: string) {
      return getExecution(id);
    },

    async cancelExecution(id: string) {
      return cancelExecution(id);
    },
  };
}
