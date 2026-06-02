import { prisma, Prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { getConnectorForTool } from '@ai-assistant/integrations';
import { checkToolPermission, recordToolExecution } from '@ai-assistant/permissions';
import { getToolDefinition, validateToolArgs } from '@ai-assistant/tool-schema';
import type { ToolSource } from '@ai-assistant/types';
import { decryptCredentials } from './encryption';
import { executeNotesTool } from './notes-executor';
import { executePlatformTool } from './platform-tools';

const PLATFORM_TOOLS = new Set([
  'resources.search',
  'contacts.resolve',
  'whatsapp.search_messages',
]);
import {
  createExecution,
  updateExecution,
  type ExecutionRecord,
} from './execution-store';

function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function resolveConnection(userId: string, connectorId: string) {
  return prisma.userConnection.findFirst({
    where: { userId, providerId: connectorId, status: 'ACTIVE' },
  });
}

export interface StartExecutionInput {
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  source: ToolSource;
  confirmed: boolean;
  preview?: boolean;
  connectionId?: string;
  chatSessionId?: string;
}

export async function startExecution(input: StartExecutionInput): Promise<ExecutionRecord> {
  const toolDef = getToolDefinition(input.tool);
  if (!toolDef) throw new Error(`Unknown tool: ${input.tool}`);

  const validation = validateToolArgs(input.tool, input.args);
  if (!validation.success) throw new Error(validation.error);

  const permission = checkToolPermission({
    tool: input.tool,
    source: input.source,
    confirmed: input.confirmed,
    userId: input.userId,
  });

  if (!permission.allowed) {
    const err = new Error(permission.reason ?? 'Permission denied') as Error & {
      requiresConfirmation?: boolean;
    };
    err.requiresConfirmation = permission.requiresConfirmation;
    throw err;
  }

  const isNotesTool = input.tool.startsWith('notes.');
  const isPlatformTool = PLATFORM_TOOLS.has(input.tool);

  const connector = isNotesTool || isPlatformTool ? null : getConnectorForTool(input.tool);
  if (!isNotesTool && !isPlatformTool && !connector) {
    throw new Error(`No connector for tool: ${input.tool}`);
  }

  const connection = isNotesTool || isPlatformTool
    ? null
    : input.connectionId
      ? await prisma.userConnection.findFirst({
          where: { id: input.connectionId, userId: input.userId, status: 'ACTIVE' },
        })
      : await resolveConnection(input.userId, connector!.providerId);

  if (!isNotesTool && !isPlatformTool && !connection) {
    throw new Error(
      `No active ${connector!.providerId} connection. Connect it in Connect Apps first.`
    );
  }

  const executionId = generateExecutionId();

  const record = createExecution({
    executionId,
    userId: input.userId,
    tool: input.tool,
    connector: isNotesTool ? 'notes' : isPlatformTool ? 'platform' : connector!.providerId,
    args: input.args,
    source: input.source,
    confirmed: input.confirmed,
    connectionId: connection?.id,
    chatSessionId: input.chatSessionId,
    supportsCancellation: toolDef.supportsCancellation,
  });

  if (input.preview) {
    return record;
  }

  await prisma.toolInvocation.create({
    data: {
      userId: input.userId,
      connectionId: connection?.id,
      executionId,
      toolName: input.tool,
      args: input.args as Prisma.InputJsonValue,
      status: 'RUNNING',
      source: input.source,
      chatSessionId: input.chatSessionId,
      confirmed: input.confirmed,
    },
  });

  await publishEvent(EventNames.TOOL_CALLED, {
    userId: input.userId,
    executionId,
    tool: input.tool,
    connector: isNotesTool ? 'notes' : isPlatformTool ? 'platform' : connector!.providerId,
    status: 'started',
    source: input.source,
  });

  void runExecution(
    record,
    connection?.encryptedCredentials ?? null,
    connection?.metadata as Record<string, unknown> | null,
    isNotesTool,
    isPlatformTool
  );

  return record;
}

async function runExecution(
  record: ExecutionRecord,
  encryptedCredentials: string | null,
  connectionMetadata: Record<string, unknown> | null,
  isNotesTool = false,
  isPlatformTool = false
): Promise<void> {
  updateExecution(record.executionId, { status: 'running' });

  try {
    if (isPlatformTool) {
      const result = await executePlatformTool(record.userId, record.tool, record.args);
      if (!result.success) throw new Error(result.error ?? 'Platform tool failed');
      updateExecution(record.executionId, {
        status: 'completed',
        result: result.data,
        progress: 100,
      });
      await prisma.toolInvocation.updateMany({
        where: { executionId: record.executionId },
        data: {
          status: 'COMPLETED',
          result: result.data as object,
          completedAt: new Date(),
        },
      });
      recordToolExecution(record.userId, record.tool);
      await publishEvent(EventNames.TOOL_COMPLETED, {
        userId: record.userId,
        executionId: record.executionId,
        tool: record.tool,
        status: 'completed',
        result: result.data,
      });
      return;
    }

    if (isNotesTool) {
      await publishEvent(EventNames.TOOL_PROGRESS, {
        userId: record.userId,
        executionId: record.executionId,
        tool: record.tool,
        status: 'progress',
        message: `Saving note...`,
        progress: 10,
      });

      const result = await executeNotesTool(record.userId, record.tool, record.args);

      if (!result.success) {
        throw new Error(result.error ?? 'Note save failed');
      }

      updateExecution(record.executionId, {
        status: 'completed',
        result: result.data,
        progress: 100,
      });

      await prisma.toolInvocation.updateMany({
        where: { executionId: record.executionId },
        data: {
          status: 'COMPLETED',
          result: result.data as object,
          completedAt: new Date(),
        },
      });

      recordToolExecution(record.userId, record.tool);

      await publishEvent(EventNames.TOOL_COMPLETED, {
        userId: record.userId,
        executionId: record.executionId,
        tool: record.tool,
        status: 'completed',
        result: result.data,
      });
      return;
    }

    const connector = getConnectorForTool(record.tool)!;
    let credentials: Record<string, unknown> = {};
    if (encryptedCredentials) {
      credentials = JSON.parse(decryptCredentials(encryptedCredentials));
    }

    const bridgeSessionId = connectionMetadata?.bridgeSessionId as string | undefined;
    const connectorConnectionId =
      record.connector === 'whatsapp' && bridgeSessionId
        ? bridgeSessionId
        : (record.connectionId ?? record.connector);

    const ctx = {
      userId: record.userId,
      connectionId: connectorConnectionId,
      chatSessionId: record.chatSessionId,
      source: record.source,
      confirmed: record.confirmed,
      executionId: record.executionId,
      signal: record.abortController.signal,
    };

    await publishEvent(EventNames.TOOL_PROGRESS, {
      userId: record.userId,
      executionId: record.executionId,
      tool: record.tool,
      status: 'progress',
      message: `Executing ${record.tool}...`,
      progress: 10,
    });

    const result = await connector.executeTool(
      connectorConnectionId,
      record.tool,
      record.args,
      ctx,
      credentials
    );

    if (record.abortController.signal.aborted) {
      throw new Error('Execution cancelled');
    }

    const toolResult = result && 'success' in result ? result : { success: true, data: result };

    if (!toolResult.success) {
      throw new Error(toolResult.error ?? 'Tool execution failed');
    }

    updateExecution(record.executionId, {
      status: 'completed',
      result: toolResult.data,
      progress: 100,
    });

    await prisma.toolInvocation.updateMany({
      where: { executionId: record.executionId },
      data: {
        status: 'COMPLETED',
        result: toolResult.data as object,
        completedAt: new Date(),
      },
    });

    recordToolExecution(record.userId, record.tool);

    await publishEvent(EventNames.TOOL_COMPLETED, {
      userId: record.userId,
      executionId: record.executionId,
      tool: record.tool,
      status: 'completed',
      result: toolResult.data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('cancelled') ? 'cancelled' : 'failed';

    updateExecution(record.executionId, { status: status as 'failed' | 'cancelled', error: message });

    await prisma.toolInvocation.updateMany({
      where: { executionId: record.executionId },
      data: {
        status: status === 'cancelled' ? 'CANCELLED' : 'FAILED',
        error: message,
        completedAt: new Date(),
      },
    });

    const eventName =
      status === 'cancelled' ? EventNames.TOOL_CANCELLED : EventNames.TOOL_FAILED;

    await publishEvent(eventName, {
      userId: record.userId,
      executionId: record.executionId,
      tool: record.tool,
      status: status as 'failed' | 'cancelled',
      error: message,
    });
  }
}
