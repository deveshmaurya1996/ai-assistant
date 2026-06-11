import { getToolDefinition, isBlockedIntegrationTool } from '@ai-assistant/tool-schema';
import type { ToolSource } from '@ai-assistant/types';
import { GENERATED_DEFAULT_POLICIES } from './generated/default-policies';
import type { ToolPolicy } from './types';

export type { ToolPolicy } from './types';

const DEFAULT_POLICIES: ToolPolicy[] = GENERATED_DEFAULT_POLICIES;
const policyMap = new Map(DEFAULT_POLICIES.map((p) => [p.tool, p]));
const executionCounts = new Map<string, { count: number; resetAt: number }>();

export function getToolPolicy(tool: string): ToolPolicy | undefined {
  return policyMap.get(tool);
}

export interface PermissionCheckInput {
  tool: string;
  source: ToolSource;
  confirmed: boolean;
  userId: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

export function checkToolPermission(input: PermissionCheckInput): PermissionCheckResult {
  const { tool, source, confirmed, userId } = input;
  if (isBlockedIntegrationTool(tool)) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: 'Deleting emails or WhatsApp messages is not supported.',
    };
  }
  const def = getToolDefinition(tool);
  if (!def) {
    return { allowed: false, requiresConfirmation: false, reason: `Unknown tool: ${tool}` };
  }

  const policy = getToolPolicy(tool);
  if (!policy) {
    return {
      allowed: def.dangerous ? confirmed : true,
      requiresConfirmation: def.dangerous,
      reason: def.dangerous && !confirmed ? 'Confirmation required' : undefined,
    };
  }

  if (!policy.allowedSources.includes(source)) {
    return {
      allowed: false,
      requiresConfirmation: policy.requiresConfirmation,
      reason: `Tool ${tool} not allowed from source ${source}`,
    };
  }

  if (policy.automationRequiresPreApproval && (source === 'automation' || source === 'workflow')) {
    if (!confirmed) {
      return {
        allowed: false,
        requiresConfirmation: true,
        reason: 'Automation requires pre-approved confirmation',
      };
    }
  }

  if (policy.requiresConfirmation && !confirmed) {
    return {
      allowed: false,
      requiresConfirmation: true,
      reason: 'User confirmation required',
    };
  }

  if (policy.maxExecutionsPerHour) {
    const key = `${userId}:${tool}`;
    const now = Date.now();
    const entry = executionCounts.get(key);
    if (entry && entry.resetAt > now && entry.count >= policy.maxExecutionsPerHour) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: 'Rate limit exceeded',
      };
    }
  }

  return { allowed: true, requiresConfirmation: policy.requiresConfirmation };
}

export function recordToolExecution(userId: string, tool: string): void {
  const policy = getToolPolicy(tool);
  if (!policy?.maxExecutionsPerHour) return;

  const key = `${userId}:${tool}`;
  const now = Date.now();
  const entry = executionCounts.get(key);
  if (!entry || entry.resetAt <= now) {
    executionCounts.set(key, { count: 1, resetAt: now + 3600_000 });
  } else {
    entry.count += 1;
  }
}
