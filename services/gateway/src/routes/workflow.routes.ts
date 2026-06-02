import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@ai-assistant/database';
import { WorkflowSchema, executeWorkflow, type WorkflowAction } from '@ai-assistant/workflows';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { toolRuntimeFetch, skillRuntimeFetch } from '../lib/runtime-clients';
import { scheduleWorkflow, unscheduleWorkflow } from '../workers/workflow.worker';
import { EventNames, publishEvent } from '@ai-assistant/events';

const CreateWorkflowSchema = z.object({
  name: z.string().min(1),
  trigger: z.record(z.string(), z.unknown()),
  conditions: z.array(z.record(z.string(), z.unknown())).optional(),
  actions: z.array(
    z.object({
      connector: z.string().optional(),
      tool: z.string().optional(),
      capability: z.string().optional(),
      provider: z.string().optional(),
      args: z.record(z.string(), z.unknown()),
      onError: z.enum(['fail', 'skip', 'retry']).optional(),
    })
  ),
  retries: z.record(z.string(), z.unknown()).optional(),
  rollback: z
    .array(
      z.object({
        connector: z.string(),
        tool: z.string(),
        args: z.record(z.string(), z.unknown()),
      })
    )
    .optional(),
  isActive: z.boolean().optional(),
});

export async function workflowRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const workflows = await prisma.workflow.findMany({
        where: { userId },
        include: { runs: { take: 3, orderBy: { startedAt: 'desc' } } },
      });
      return reply.send(workflows);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = CreateWorkflowSchema.parse(request.body);
      const workflow = await prisma.workflow.create({
        data: {
          userId,
          name: body.name,
          trigger: body.trigger as Prisma.InputJsonValue,
          conditions: (body.conditions ?? []) as Prisma.InputJsonValue,
          actions: body.actions as Prisma.InputJsonValue,
          retries: body.retries as Prisma.InputJsonValue,
          rollback: body.rollback as Prisma.InputJsonValue,
          isActive: body.isActive ?? true,
        },
      });

      const trigger = body.trigger as { type?: string; schedule?: string };
      if (workflow.isActive && trigger.type === 'cron' && trigger.schedule) {
        try {
          await scheduleWorkflow(workflow.id, trigger.schedule);
        } catch (err) {
          console.warn('[workflow] cron schedule failed:', err);
        }
      }

      return reply.code(201).send(workflow);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/:id/run', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };

      const row = await prisma.workflow.findFirst({ where: { id, userId } });
      if (!row) return reply.code(404).send({ error: 'Not found' });

      const run = await prisma.workflowRun.create({
        data: { workflowId: id, status: 'RUNNING' },
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
        { userId, workflowId: id, runId: run.id },
        async (action: WorkflowAction, ctx: { userId: string; workflowId: string; runId: string }) => {
          const capAction = action as WorkflowAction & {
            capability?: string;
            provider?: string;
          };
          if (capAction.capability) {
            const res = await skillRuntimeFetch('/v1/execute', {
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
          if (!res.ok) {
            return { success: false, error: await res.text() };
          }
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

      await publishEvent(
        result.success ? EventNames.WORKFLOW_STEP_COMPLETED : EventNames.WORKFLOW_FAILED,
        {
          userId,
          workflowId: id,
          runId: run.id,
          status: result.success ? 'step_completed' : 'failed',
        }
      );

      return reply.send({ runId: run.id, ...result });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
