import type { Capability, ExecutionContext, IntegrationConnector, JsonObject, ToolResult } from './types';

export const FILES_TOOL_NAMESPACES = ['files'] as const;

export class FilesConnector implements IntegrationConnector {
  providerId = 'files';
  capabilities: Capability[] = ['search', 'read'];

  async executeTool(
    _connectionId: string,
    tool: string,
    args: JsonObject,
    ctx: ExecutionContext,
    _credentials: JsonObject
  ): Promise<ToolResult> {
    if (tool === 'files.search') {
      return {
        success: true,
        data: {
          query: args.query,
          userId: ctx.userId,
          results: [],
          message: 'File search delegated to ingestion-engine index',
        },
      };
    }
    return { success: false, error: `Unknown files tool: ${tool}` };
  }
}
