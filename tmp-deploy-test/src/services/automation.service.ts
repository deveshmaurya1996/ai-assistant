import { Prisma, prisma, type Automation } from '@ai-assistant/database';
import type { AgentDigestAction, UpdateAutomationInput } from '@ai-assistant/types';
import { badRequest, notFound } from '../lib/errors';
import { normalizeAutomationScheduleInput } from '../lib/automation-input';
import { humanizeAutomationQuery } from '../lib/humanize-automation-query';
import {
  humanizeCron,
  validateCronExpression,
} from '../scheduler/cron-utils';
import {
  isSchedulerReady,
  scheduleCronJob,
  unscheduleJob,
} from '../scheduler';
import { normalizeClientTimezone } from './normalize-client-timezone';

export type AutomationWithLabel = Automation & { scheduleLabel: string | null };

function actionTimezone(action: unknown): string {
  if (!action || typeof action !== 'object') return 'UTC';
  const tz = (action as AgentDigestAction).timezone;
  return tz?.trim() ? normalizeClientTimezone(tz) : 'UTC';
}

export function serializeAutomation(automation: Automation): AutomationWithLabel {
  const timezone = actionTimezone(automation.action);
  const scheduleLabel = automation.schedule
    ? humanizeCron(automation.schedule, timezone)
    : null;
  return { ...automation, scheduleLabel };
}

export async function updateAutomation(
  userId: string,
  automationId: string,
  input: UpdateAutomationInput
): Promise<AutomationWithLabel> {
  const existing = await prisma.automation.findFirst({
    where: { id: automationId, userId },
  });
  if (!existing) throw notFound('Automation not found');

  const action = { ...(existing.action as unknown as AgentDigestAction) };
  if (input.query !== undefined) {
    action.query = humanizeAutomationQuery(input.query, action.userPrompt);
  }
  if (input.timezone !== undefined) {
    action.timezone = normalizeClientTimezone(input.timezone);
  }

  const schedule =
    normalizeAutomationScheduleInput(input) ?? existing.schedule ?? undefined;
  const timezone = actionTimezone(action);

  if (schedule && !validateCronExpression(schedule, timezone)) {
    throw badRequest(`Invalid cron expression: ${schedule}`);
  }

  const isActive = input.isActive ?? existing.isActive;
  const updated = await prisma.automation.update({
    where: { id: automationId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(normalizeAutomationScheduleInput(input) !== undefined ? { schedule } : {}),
      ...(input.isActive !== undefined ? { isActive } : {}),
      action: action as Prisma.InputJsonValue,
    },
  });

  await unscheduleJob('automation', automationId);
  if (isActive && schedule && isSchedulerReady()) {
    await scheduleCronJob({
      kind: 'automation',
      entityId: automationId,
      cron: schedule,
      timezone,
    });
  }

  return serializeAutomation(updated);
}

export async function listAutomationsForUser(userId: string) {
  const rows = await prisma.automation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(serializeAutomation);
}

export async function findAutomationByName(userId: string, name: string) {
  const rows = await prisma.automation.findMany({
    where: { userId, isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  const lower = name.toLowerCase();
  return (
    rows.find((a) => a.name.toLowerCase().includes(lower)) ??
    rows.find((a) => {
      const action = a.action as unknown as AgentDigestAction;
      return action.pushTitle?.toLowerCase().includes(lower);
    }) ??
    null
  );
}

export async function deleteAutomation(
  userId: string,
  automationId: string
): Promise<void> {
  const existing = await prisma.automation.findFirst({
    where: { id: automationId, userId },
  });
  if (!existing) throw notFound('Automation not found');

  await unscheduleJob('automation', automationId);
  await prisma.automation.delete({ where: { id: automationId } });
}
