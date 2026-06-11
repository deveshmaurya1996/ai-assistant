import { z } from 'zod';
import type { ToolSource } from '@ai-assistant/types';
import { TOOL_CATALOG_META } from './generated/tool-meta';
import { TOOL_PARAMETER_SCHEMAS } from './tool-schemas';

export type { ToolSource } from '@ai-assistant/types';
export {
  automationCreateParams,
  automationUpdateParams,
  automationCancelParams,
  type AutomationCreateArgs,
  type AutomationUpdateArgs,
  type AutomationCancelArgs,
} from './tool-schemas';
export { isPlatformTool, PLATFORM_TOOL_NAMES } from './generated/tool-meta';

export interface ToolDefinition {
  name: string;
  version: string;
  connector: string;
  description: string;
  parameters: z.ZodType;
  supportsCancellation: boolean;
  dangerous: boolean;
  openAiParameters: Record<string, unknown>;
}

function toOpenAiSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      const zodVal = val as z.ZodTypeAny;
      if (zodVal instanceof z.ZodString) {
        properties[key] = { type: 'string', description: key };
      } else if (zodVal instanceof z.ZodNumber) {
        properties[key] = { type: 'number', description: key };
      } else if (zodVal instanceof z.ZodBoolean) {
        properties[key] = { type: 'boolean', description: key };
      } else if (zodVal instanceof z.ZodArray) {
        properties[key] = { type: 'array', items: { type: 'string' } };
      } else if (zodVal instanceof z.ZodEnum) {
        properties[key] = { type: 'string', enum: zodVal.options };
      } else {
        properties[key] = { type: 'string' };
      }
      if (!zodVal.isOptional()) required.push(key);
    }
    return { type: 'object', properties, required };
  }
  return { type: 'object', properties: {} };
}

function buildToolRegistry(): ToolDefinition[] {
  return TOOL_CATALOG_META.map((meta) => {
    const parameters = TOOL_PARAMETER_SCHEMAS[meta.name];
    if (!parameters) {
      throw new Error(`Missing Zod schema for tool: ${meta.name}`);
    }
    return {
      name: meta.name,
      version: meta.version,
      connector: meta.connector,
      description: meta.description,
      parameters,
      supportsCancellation: meta.supportsCancellation,
      dangerous: meta.dangerous,
      openAiParameters: toOpenAiSchema(parameters),
    };
  });
}

export const TOOL_REGISTRY: ToolDefinition[] = buildToolRegistry();
const toolMap = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolMap.get(name);
}

export function validateToolArgs(
  name: string,
  args: unknown
): { success: true; data: unknown } | { success: false; error: string } {
  const tool = getToolDefinition(name);
  if (!tool) return { success: false, error: `Unknown tool: ${name}` };
  const result = tool.parameters.safeParse(args);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data };
}

export function listToolsForConnector(connector: string): ToolDefinition[] {
  return TOOL_REGISTRY.filter((t) => t.connector === connector);
}

export function listAllToolsOpenAi(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return TOOL_REGISTRY.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.openAiParameters,
    },
  }));
}

export {
  BLOCKED_INTEGRATION_TOOLS,
  isBlockedIntegrationTool,
} from './generated/integration-policy';

export function listToolsForUserOpenAi(activeProviderIds: string[]): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  const allowed = new Set(activeProviderIds);
  allowed.add('platform');
  return TOOL_REGISTRY.filter((t) => allowed.has(t.connector)).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.openAiParameters,
    },
  }));
}
