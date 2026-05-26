export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'working';

export interface MemoryRecord {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
  embeddingId?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface MemoryQuery {
  userId: string;
  types?: MemoryType[];
  query?: string;
  limit?: number;
}

export interface MemoryStore {
  getWorking(userId: string, sessionId?: string): Promise<Record<string, unknown>>;
  setWorking(
    userId: string,
    data: Record<string, unknown>,
    sessionId?: string,
    ttlSeconds?: number
  ): Promise<void>;
  search(query: MemoryQuery): Promise<MemoryRecord[]>;
  save(record: Omit<MemoryRecord, 'id' | 'createdAt'>): Promise<MemoryRecord>;
}

export class InMemoryMemoryStore implements MemoryStore {
  private working = new Map<string, Record<string, unknown>>();
  private records: MemoryRecord[] = [];

  private workingKey(userId: string, sessionId?: string) {
    return `${userId}:${sessionId ?? 'default'}`;
  }

  async getWorking(userId: string, sessionId?: string): Promise<Record<string, unknown>> {
    return this.working.get(this.workingKey(userId, sessionId)) ?? {};
  }

  async setWorking(
    userId: string,
    data: Record<string, unknown>,
    sessionId?: string
  ): Promise<void> {
    this.working.set(this.workingKey(userId, sessionId), data);
  }

  async search(query: MemoryQuery): Promise<MemoryRecord[]> {
    let results = this.records.filter((r) => r.userId === query.userId);
    if (query.types?.length) {
      results = results.filter((r) => query.types!.includes(r.type));
    }
    if (query.query) {
      const q = query.query.toLowerCase();
      results = results.filter((r) => r.content.toLowerCase().includes(q));
    }
    return results.slice(0, query.limit ?? 10);
  }

  async save(record: Omit<MemoryRecord, 'id' | 'createdAt'>): Promise<MemoryRecord> {
    const saved: MemoryRecord = {
      ...record,
      id: `mem_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.records.push(saved);
    return saved;
  }
}

export interface ComposedContext {
  episodic: MemoryRecord[];
  semantic: MemoryRecord[];
  procedural: MemoryRecord[];
  working: Record<string, unknown>;
}

export function composeMemoryContext(
  episodic: MemoryRecord[],
  semantic: MemoryRecord[],
  procedural: MemoryRecord[],
  working: Record<string, unknown>
): ComposedContext {
  return { episodic, semantic, procedural, working };
}

export function formatMemoryForPrompt(ctx: ComposedContext): string {
  const parts: string[] = [];
  if (ctx.procedural.length) {
    parts.push('## Learned habits\n' + ctx.procedural.map((m) => `- ${m.content}`).join('\n'));
  }
  if (ctx.semantic.length) {
    parts.push('## Relevant facts\n' + ctx.semantic.map((m) => `- ${m.content}`).join('\n'));
  }
  if (ctx.episodic.length) {
    parts.push('## Recent context\n' + ctx.episodic.map((m) => `- ${m.content}`).join('\n'));
  }
  if (Object.keys(ctx.working).length) {
    parts.push('## Session context\n' + JSON.stringify(ctx.working));
  }
  return parts.join('\n\n');
}
