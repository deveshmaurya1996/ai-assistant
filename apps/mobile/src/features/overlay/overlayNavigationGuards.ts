import type { OverlayNavigationTarget } from './resolveOverlayRoute';
import {
  overlayTargetMatchesRoute,
  resolveOverlayForegroundScreen,
} from './resolveOverlayRoute';

export function shouldSkipOverlayNavigation(
  pathname: string,
  segments: readonly string[],
  target: OverlayNavigationTarget,
  voiceActive = false
): boolean {
  if (pathname.includes('/assistant') && target.kind === 'chat') {
    return true;
  }

  if (overlayTargetMatchesRoute(pathname, target)) {
    return true;
  }

  const foreground = resolveOverlayForegroundScreen(segments);

  if (voiceActive && target.kind === 'chat') {
    return true;
  }

  if (target.kind === 'voice' && foreground === 'voice') {
    return true;
  }

  if (target.kind === 'chat' && foreground === 'voice') {
    return true;
  }

  return false;
}
