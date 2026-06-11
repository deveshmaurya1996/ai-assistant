export type ParsedCliCommand = {
  capabilityId: string;
  providerId?: string;
  args: Record<string, unknown>;
};

export function parseAssistantCliCommand(command: string): ParsedCliCommand | null {
  const trimmed = command.trim();
  const match = trimmed.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;

  const capabilityId = match[1]!;
  const rest = (match[2] ?? '').trim();
  if (!rest) return { capabilityId, args: {} };

  try {
    const args = JSON.parse(rest) as Record<string, unknown>;
    return { capabilityId, args };
  } catch {
    return { capabilityId, args: { query: rest } };
  }
}
