import { Queue, Worker } from 'bullmq';
import { config } from '@ai-assistant/config';
import { prisma, Prisma } from '@ai-assistant/database';
import { WorkflowSchema, executeWorkflow, type WorkflowAction } from '@ai-assistant/workflows';
import { createBullMqWorkerConnection, getBullMqQueueConnection } from '../lib/bullmq-redis';
import { capabilityRuntimeFetch, toolRuntimeFetch } from '../lib/runtime-clients';

let workflowQueue: Queue | null = null;
let workflowWorker: Worker | null = null;

export async function enqueueWorkflowRun(workflowId: string) {
  if (!workflowQueue) throw new Error('Workflow queue not initialized');
  await workflowQueue.add('run', { workflowId }, { removeOnComplete: true });
}

export async function scheduleWorkflow(workflowId: string, cron: string) {
  if (!workflowQueue) throw new Error('Workflow queue not initialized');
  await workflowQueue.add(
    'run',
    { workflowId },
    {
      jobId: `workflow-cron-${workflowId}`,
      repeat: { pattern: cron },
      removeOnComplete: true,
    }
  );
}

export async function unscheduleWorkflow(workflowId: string) {
  if (!workflowQueue) return;
  const repeatable = await workflowQueue.getRepeatableJobs();
  for (const job of repeatable) {
    if (job.id === `workflow-cron-${workflowId}`) {
      await workflowQueue.removeRepeatableByKey(job.key);
    }
  }
}

export function startWorkflowWorker(): Worker | null {
  try {
    workflowQueue = new Queue('workflow-queue', { connection: getBullMqQueueConnection() });
    workflowWorker = new Worker(
      'workflow-queue',
      async (job) => {
        const { workflowId } = job.data as { workflowId: string };
        const row = await prisma.workflow.findUnique({ where: { id: workflowId } });
        if (!row?.isActive) return;

        const run = await prisma.workflowRun.create({
          data: { workflowId, status: 'RUNNING' },
        });

        const workflow = WorkflowSchema.parse({
          id: row.id,
          userId: row.userId,
          name: row.name,
          trigger: row.trigger,
          conditions: row.conditions,
          actions: row.actions,
          retries: row.retries,
          rollback: row.rollback,
          isActive: row.isActive,
        });

        const result = await executeWorkflow(
          workflow,
          { userId: row.userId, workflowId, runId: run.id },
          async (action: WorkflowAction, ctx: { userId: string; workflowId: string; runId: string }) => {
            const capAction = action as WorkflowAction & {
              capability?: string;
              provider?: string;
            };
            if (capAction.capability) {
              const res = await capabilityRuntimeFetch('/v1/execute', {
                method: 'POST',
                body: JSON.stringify({
                  userId: ctx.userId,
                  capability: capAction.capability,
                  provider: capAction.provider,
                  args: action.args,
                  source: 'workflow',
                  confirmed: true,
                }),
              });
              if (!res.ok) return { success: false, error: await res.text() };
              return { success: true, result: await res.json() };
            }
            const res = await toolRuntimeFetch('/v1/executions', {
              method: 'POST',
              body: JSON.stringify({
                userId: ctx.userId,
                tool: action.tool,
                args: action.args,
                source: 'workflow',
                confirmed: true,
              }),
            });
            if (!res.ok) return { success: false, error: await res.text() };
            return { success: true, result: await res.json() };
          }
        );

        await prisma.workflowRun.update({
          where: { id: run.id },
          data: {
            status: result.success ? 'COMPLETED' : 'FAILED',
            steps: result.steps as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
      },
      {
        connection: createBullMqWorkerConnection(),
        concurrency: config.workflowConcurrency,
      }
    );
    console.log('[workflow-worker] started');
    return workflowWorker;
  } catch (err) {
    console.warn('[workflow-worker] disabled:', err);
    return null;
  }
}

export async function closeWorkflowWorker(): Promise<void> {
  await workflowWorker?.close();
  await workflowQueue?.close();
  workflowWorker = null;
  workflowQueue = null;
}
