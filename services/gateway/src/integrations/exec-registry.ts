import type { GatewayExecAdapter, GatewayExecContext, ToolExecutionOutcome } from './types';

const adapters: GatewayExecAdapter[] = [];

export function registerGatewayExecAdapter(adapter: GatewayExecAdapter): void {
  adapters.push(adapter);
}

export function findGatewayExecAdapter(tool: string): GatewayExecAdapter | undefined {
  return adapters.find((adapter) => adapter.supportsTool(tool));
}

export async function executeGatewayTool(ctx: GatewayExecContext): Promise<ToolExecutionOutcome | null> {
  const adapter = findGatewayExecAdapter(ctx.tool);
  if (!adapter) return null;
  return adapter.execute(ctx);
}
