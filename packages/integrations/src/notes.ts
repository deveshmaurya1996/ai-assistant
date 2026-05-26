import type { Capability, ExecutionContext, IntegrationConnector, JsonObject, ToolResult } from './types';

const notesStore = new Map<string, Array<{ id: string; title: string; content: string }>>();

export const NOTES_TOOL_NAMESPACES = ['notes'] as const;

export class NotesConnector implements IntegrationConnector {
  providerId = 'notes';
  capabilities: Capability[] = ['search', 'read', 'write'];

  async executeTool(
    _connectionId: string,
    tool: string,
    args: JsonObject,
    ctx: ExecutionContext,
    _credentials: JsonObject
  ): Promise<ToolResult> {
    const userNotes = notesStore.get(ctx.userId) ?? [];

    if (tool === 'notes.create') {
      const note = {
        id: `note_${Date.now()}`,
        title: String(args.title),
        content: String(args.content),
      };
      userNotes.push(note);
      notesStore.set(ctx.userId, userNotes);
      return { success: true, data: note };
    }

    if (tool === 'notes.search') {
      const q = String(args.query).toLowerCase();
      const results = userNotes.filter(
        (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
      );
      return { success: true, data: { results } };
    }

    return { success: false, error: `Unknown notes tool: ${tool}` };
  }
}
