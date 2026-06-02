import { getToolDefinition } from '@ai-assistant/tool-schema';
import type { ToolSource } from '@ai-assistant/types';

export interface ToolPolicy {
  tool: string;
  requiresConfirmation: boolean;
  allowedSources: ToolSource[];
  dangerous: boolean;
  cooldownSeconds?: number;
  maxExecutionsPerHour?: number;
  automationRequiresPreApproval: boolean;
}

const DEFAULT_POLICIES: ToolPolicy[] = [
  {
    tool: 'gmail.search',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'gmail.send',
    requiresConfirmation: true,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: true,
    cooldownSeconds: 30,
    maxExecutionsPerHour: 20,
    automationRequiresPreApproval: true,
  },
  {
    tool: 'calendar.create_event',
    requiresConfirmation: true,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: true,
    automationRequiresPreApproval: true,
  },
  {
    tool: 'calendar.list',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'drive.search',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'whatsapp.send_message',
    requiresConfirmation: true,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: true,
    cooldownSeconds: 10,
    automationRequiresPreApproval: true,
  },
  {
    tool: 'whatsapp.search_chats',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'whatsapp.list_unread',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'whatsapp.read_chat',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'email.list_unread',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'email.read_email',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'email.send_email',
    requiresConfirmation: true,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: true,
    automationRequiresPreApproval: true,
  },
  {
    tool: 'calendar.list_upcoming',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'files.search_documents',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'files.search',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'files.get_summary',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'files.get_chunks',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'files.analyze_image',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'notes.create',
    requiresConfirmation: true,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'notes.search',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'whatsapp.search_messages',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'resources.search',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'contacts.resolve',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'email.draft_reply',
    requiresConfirmation: false,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: false,
    automationRequiresPreApproval: false,
  },
  {
    tool: 'calendar.cancel_event',
    requiresConfirmation: true,
    allowedSources: ['chat', 'voice', 'automation', 'workflow', 'manual'],
    dangerous: true,
    automationRequiresPreApproval: true,
  },
];

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
