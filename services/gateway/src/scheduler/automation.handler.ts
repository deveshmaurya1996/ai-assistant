import { prisma, Prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { toolRuntimeFetch } from '../lib/runtime-clients';
import { fireInboxDigestAutomation } from '../services/digest-automation.service';

export async function fireAutomation(automationId: string): Promise<void> {
  const automation = await prisma.automation.findUnique({
    where: { id: automationId },
  });
  if (!automation?.isActive) return;

  const run = await prisma.automationRun.create({
    data: { automationId, status: 'RUNNING' },
  });

  await publishEvent(EventNames.AUTOMATION_STARTED, {
    userId: automation.userId,
    automationId,
    runId: run.id,
    status: 'started',
  });

  try {
    const action = automation.action as {
      type?: string;
      tool?: string;
      connector?: string;
      args?: Record<string, unknown>;
      query?: string;
      pushTitle?: string;
      timezone?: string;
    };

    let result: unknown = { executed: action, at: new Date().toISOString() };

    if (action.type === 'agent_digest') {
      const summary = await fireInboxDigestAutomation(
        automationId,
        automation.userId,
        {
          type: 'agent_digest',
          query: action.query,
          pushTitle: action.pushTitle,
          timezone: action.timezone,
        },
        automation.name
      );
      result = { type: 'agent_digest', summary, at: new Date().toISOString() };
    } else if (action.tool) {
      const res = await toolRuntimeFetch('/v1/executions', {
        method: 'POST',
        body: JSON.stringify({
          userId: automation.userId,
          tool: action.tool,
          args: action.args ?? {},
          source: 'automation',
          confirmed: true,
        }),
      });
      result = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(result));
    }

    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        result: result as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    await publishEvent(EventNames.AUTOMATION_COMPLETED, {
      userId: automation.userId,
      automationId,
      runId: run.id,
      status: 'completed',
    });
  } catch (err) {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        result: {
          error: err instanceof Error ? err.message : 'Unknown error',
        } as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    await publishEvent(EventNames.AUTOMATION_COMPLETED, {
      userId: automation.userId,
      automationId,
      runId: run.id,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
