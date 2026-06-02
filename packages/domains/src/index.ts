import {
  resolveCapabilityExecution,
  selectProvider,
  type ConnectedProviderInput,
  type UserPreferences,
} from '@ai-assistant/capabilities';
import {
  getToolAdapter,
  type AdapterContext,
  type JsonObject,
  type ToolResult,
} from '@ai-assistant/integrations';
import { executeMessagingDomain } from './messaging';
import { executeEmailDomain } from './email';
import { executeCalendarDomain } from './calendar';
import { executeFilesDomain } from './files';

export type DomainExecuteInput = {
  capabilityId: string;
  args: JsonObject;
  userId: string;
  connectionId?: string;
  bridgeSessionId?: string;
  credentials?: JsonObject;
  connectedProviders: ConnectedProviderInput[];
  userPreferences?: UserPreferences;
  providerId?: string;
  source: AdapterContext['source'];
  confirmed: boolean;
  executionId: string;
  chatSessionId?: string;
};

export async function executeDomainCapability(input: DomainExecuteInput): Promise<ToolResult> {
  const resolved = resolveCapabilityExecution(input.capabilityId, input.providerId);
  if (!resolved) {
    return { success: false, error: `Unknown capability: ${input.capabilityId}` };
  }

  const choice =
    input.providerId != null
      ? {
          providerId: resolved.providerId,
          adapterAction: resolved.adapterAction,
          executionTool: resolved.legacyTool,
        }
      : selectProvider(input.capabilityId, input.connectedProviders, input.userPreferences);

  if (!choice) {
    return {
      success: false,
      error: `No connected provider for ${input.capabilityId}. Connect the app in Connect Apps.`,
    };
  }

  const conn =
    input.connectedProviders.find((c) => c.providerId === choice.providerId) ??
    input.connectedProviders[0];

  const ctx: AdapterContext = {
    userId: input.userId,
    connectionId: input.connectionId ?? conn?.id ?? choice.providerId,
    bridgeSessionId: input.bridgeSessionId,
    credentials: input.credentials,
    chatSessionId: input.chatSessionId,
    source: input.source,
    confirmed: input.confirmed,
    executionId: input.executionId,
  };

  switch (resolved.domain) {
    case 'messaging':
      return executeMessagingDomain(choice.adapterAction, input.args, ctx, choice.providerId);
    case 'email':
      return executeEmailDomain(choice.adapterAction, input.args, ctx, choice.providerId);
    case 'calendar':
      return executeCalendarDomain(choice.adapterAction, input.args, ctx, choice.providerId);
    case 'files':
      return executeFilesDomain(choice.adapterAction, input.args, ctx, choice.providerId);
    default: {
      const adapter = getToolAdapter(choice.providerId);
      if (!adapter) {
        return { success: false, error: `No adapter for provider: ${choice.providerId}` };
      }
      return adapter.execute(choice.adapterAction, input.args, ctx);
    }
  }
}

export { executeMessagingDomain } from './messaging';
export { executeEmailDomain } from './email';
export { executeCalendarDomain } from './calendar';
export { executeFilesDomain } from './files';
