export type ConnectionHealthResult = {
  healthy: boolean;
  error?: string | null;
};

export type ConnectionRef = {
  id: string;
  providerId: string;
  status: string;
};

export type HealthContext = {
  userId: string;
  connection: ConnectionRef;
};

export type GatewayExecContext = {
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  connectionId?: string;
};

export type ToolExecutionOutcome = {
  success: boolean;
  tool: string;
  result?: unknown;
  error?: string;
};

export type ConnectionHealthAdapter = {
  providerId: string;
  assess(ctx: HealthContext): Promise<ConnectionHealthResult>;
};

export type GatewayExecAdapter = {
  providerId: string;
  supportsTool(tool: string): boolean;
  execute(ctx: GatewayExecContext): Promise<ToolExecutionOutcome>;
};
