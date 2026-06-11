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
