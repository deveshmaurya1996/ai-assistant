import { prisma } from '@ai-assistant/database';

export type SessionModelAssignment = {
  assignedModelId: string;
  assignedReason: string;
  assignedAt: string;
  fallbackCount: number;
};

export type SessionModelContext = {
  modelAssignment?: SessionModelAssignment;
};

export function parseSessionModelContext(raw: unknown): SessionModelContext {
  if (!raw || typeof raw !== 'object') return {};
  const ctx = raw as SessionModelContext;
  const assignment = ctx.modelAssignment;
  if (!assignment || typeof assignment !== 'object') return {};
  if (typeof assignment.assignedModelId !== 'string') return {};
  return {
    modelAssignment: {
      assignedModelId: assignment.assignedModelId,
      assignedReason:
        typeof assignment.assignedReason === 'string'
          ? assignment.assignedReason
          : 'auto',
      assignedAt:
        typeof assignment.assignedAt === 'string'
          ? assignment.assignedAt
          : new Date().toISOString(),
      fallbackCount:
        typeof assignment.fallbackCount === 'number' ? assignment.fallbackCount : 0,
    },
  };
}

export async function getSessionModelAssignment(
  sessionId: string
): Promise<SessionModelAssignment | undefined> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { context: true },
  });
  return parseSessionModelContext(session?.context).modelAssignment;
}

export async function persistSessionModelAssignment(
  sessionId: string,
  modelId: string,
  reason: string,
  options?: { isFailover?: boolean; previousModelId?: string }
): Promise<void> {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  const baseContext =
    session.context && typeof session.context === 'object'
      ? { ...(session.context as Record<string, unknown>) }
      : {};
  const current = parseSessionModelContext(baseContext).modelAssignment;
  const isFailover =
    options?.isFailover === true ||
    (current?.assignedModelId != null &&
      current.assignedModelId !== modelId &&
      options?.previousModelId !== modelId);

  const assignment: SessionModelAssignment = {
    assignedModelId: modelId,
    assignedReason: isFailover ? `failover:${reason}` : reason,
    assignedAt: new Date().toISOString(),
    fallbackCount: isFailover ? (current?.fallbackCount ?? 0) + 1 : 0,
  };

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      context: {
        ...baseContext,
        modelAssignment: assignment,
      } as object,
    },
  });
}
