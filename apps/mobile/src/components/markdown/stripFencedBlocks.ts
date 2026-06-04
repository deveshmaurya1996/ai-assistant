
export function stripFencedBlocks(markdown: string): string {
  const withoutClosed = markdown.replace(/```[^\n]*\n[\s\S]*?```/g, '');
  const withoutOpen = withoutClosed.replace(/```[^\n]*(\n[\s\S]*)?$/g, '');
  return withoutOpen.trim();
}
