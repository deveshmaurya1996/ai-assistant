import {
  getToolAdapter,
  type AdapterContext,
  type JsonObject,
  type ToolResult,
} from '@ai-assistant/integrations';

export async function executeFilesDomain(
  action: string,
  args: JsonObject,
  ctx: AdapterContext,
  providerId: string
): Promise<ToolResult> {
  const adapter = getToolAdapter(providerId);
  if (!adapter) {
    return { success: false, error: `Files provider not available: ${providerId}` };
  }
  return adapter.execute(action, args, ctx);
}
