
export function stripMarkdownForPreview(content: string): string {
  let text = content.replace(/\r\n/g, '\n');
  text = text.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
    return inner.trim();
  });
  if (text.includes('```')) {
    text = text.replace(/```[^\n]*\n?/g, '').replace(/```/g, '');
  }
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/^#{1,3}\s+/gm, '');
  text = text.replace(/^>\s?/gm, '');
  return text.trim();
}
