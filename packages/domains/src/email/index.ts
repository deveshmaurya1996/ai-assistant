import {
  getToolAdapter,
  type AdapterContext,
  type JsonObject,
  type ToolResult,
} from '@ai-assistant/integrations';

export async function executeEmailDomain(
  action: string,
  args: JsonObject,
  ctx: AdapterContext,
  providerId: string
): Promise<ToolResult> {
  const adapter = getToolAdapter(providerId);
  if (!adapter) {
    return { success: false, error: `Email provider not available: ${providerId}` };
  }
  return adapter.execute(action, args, ctx);
}
