import { z } from 'zod';

export const WorkflowTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cron'), schedule: z.string() }),
  z.object({ type: z.literal('event'), eventName: z.string() }),
  z.object({ type: z.literal('manual') }),
]);

export const WorkflowConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'neq', 'contains', 'gt', 'lt']),
  value: z.unknown(),
});

export const WorkflowActionSchema = z.object({
  connector: z.string().optional(),
  tool: z.string().optional(),
  capability: z.string().optional(),
  provider: z.string().optional(),
  args: z.record(z.string(), z.unknown()),
  onError: z.enum(['fail', 'skip', 'retry']).default('fail'),
}).refine((a) => Boolean(a.capability || a.tool), {
  message: 'Each action requires capability or tool',
});

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().default(3),
  backoffMs: z.number().default(1000),
});

export const WorkflowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  trigger: WorkflowTriggerSchema,
  conditions: z.array(WorkflowConditionSchema).default([]),
  actions: z.array(WorkflowActionSchema).min(1),
  retries: RetryPolicySchema.optional(),
  rollback: z.array(WorkflowActionSchema).optional(),
  isActive: z.boolean().default(true),
});

export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowAction = z.infer<typeof WorkflowActionSchema>;
export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;
export type WorkflowCondition = z.infer<typeof WorkflowConditionSchema>;

export interface WorkflowRunContext {
  userId: string;
  workflowId: string;
  runId: string;
  triggerPayload?: Record<string, unknown>;
}

export interface WorkflowStepResult {
  stepIndex: number;
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export function evaluateConditions(
  conditions: WorkflowCondition[],
  payload: Record<string, unknown>
): boolean {
  if (!conditions.length) return true;
  return conditions.every((c) => {
    const actual = payload[c.field];
    switch (c.operator) {
      case 'eq':
        return actual === c.value;
      case 'neq':
        return actual !== c.value;
      case 'contains':
        return String(actual).includes(String(c.value));
      case 'gt':
        return Number(actual) > Number(c.value);
      case 'lt':
        return Number(actual) < Number(c.value);
      default:
        return false;
    }
  });
}

export interface ExecuteWorkflowStepFn {
  (
    action: WorkflowAction,
    ctx: WorkflowRunContext
  ): Promise<{ success: boolean; result?: unknown; error?: string }>;
}

export async function executeWorkflow(
  workflow: Workflow,
  ctx: WorkflowRunContext,
  executeStep: ExecuteWorkflowStepFn
): Promise<{ success: boolean; steps: WorkflowStepResult[] }> {
  const steps: WorkflowStepResult[] = [];
  const maxAttempts = workflow.retries?.maxAttempts ?? 3;
  const backoffMs = workflow.retries?.backoffMs ?? 1000;

  for (let i = 0; i < workflow.actions.length; i++) {
    const action = workflow.actions[i];
    let lastError: string | undefined;
    let success = false;
    let result: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const out = await executeStep(action, ctx);
      if (out.success) {
        success = true;
        result = out.result;
        break;
      }
      lastError = out.error;
      if (action.onError === 'skip') {
        success = true;
        break;
      }
      if (action.onError === 'fail' || attempt === maxAttempts - 1) break;
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }

    steps.push({
      stepIndex: i,
      tool: action.tool ?? action.capability ?? 'unknown',
      success,
      result,
      error: lastError,
    });

    if (!success && action.onError === 'fail') {
      if (workflow.rollback?.length) {
        for (const rb of workflow.rollback) {
          await executeStep(rb, ctx).catch(() => undefined);
        }
      }
      return { success: false, steps };
    }
  }

  return { success: true, steps };
}
