import type { ExecutionContext, JsonObject, ToolResult } from '../types';

export interface AdapterContext extends ExecutionContext {
  bridgeSessionId?: string;
  credentials?: JsonObject;
}

export interface ToolAdapter {
  readonly providerId: string;
  readonly supportedActions: string[];
  execute(
    action: string,
    args: JsonObject,
    ctx: AdapterContext
  ): Promise<ToolResult>;
}
