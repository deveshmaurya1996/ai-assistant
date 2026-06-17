export function sentenceChunks(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+|\S+$/g);
  return (parts ?? [text]).map((s) => s.trim()).filter(Boolean);
}
