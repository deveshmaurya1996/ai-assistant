
export const LEGACY_ASSISTANT_LABEL = 'Assistant';

export function resolveActiveChatSessionId(
  pathname: string,
  composeLiveSessionId?: string | null
): string | undefined {
  if (pathname.includes('/compose')) {
    return composeLiveSessionId ?? undefined;
  }
  if (!pathname.includes('/chat/')) {
    return undefined;
  }
  const match = pathname.match(/\/chat\/([^/]+)$/);
  const segment = match?.[1];
  if (!segment || segment === 'compose') return undefined;
  return segment;
}
