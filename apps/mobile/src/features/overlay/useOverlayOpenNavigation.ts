import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { usePathname, useRouter, useSegments } from 'expo-router';
import {
  subscribeOverlayOpened,
  type OverlayNavigationTarget,
} from '@/lib/overlay';
import { useVoiceSessionBridge } from '@/features/voice-assistant/voiceSessionBridge';
import {
  overlayActivityToHref,
  parseOverlayDeepLink,
} from './resolveOverlayRoute';
import { shouldSkipOverlayNavigation } from './overlayNavigationGuards';

function navigationKey(target: OverlayNavigationTarget): string {
  return `${target.kind}:${target.sessionKey}`;
}

export function useOverlayOpenNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const voiceActive = useVoiceSessionBridge((s) => s.isActive);
  const routerRef = useRef(router);
  const pathnameRef = useRef(pathname);
  const segmentsRef = useRef(segments);
  const voiceActiveRef = useRef(voiceActive);
  const lastNavigationRef = useRef<{ key: string; at: number } | null>(null);
  routerRef.current = router;
  pathnameRef.current = pathname;
  segmentsRef.current = segments;
  voiceActiveRef.current = voiceActive;

  useEffect(() => {
    const shouldSkipNavigation = (target: OverlayNavigationTarget): boolean =>
      shouldSkipOverlayNavigation(
        pathnameRef.current,
        segmentsRef.current,
        target,
        voiceActiveRef.current
      );

    const navigate = (target: OverlayNavigationTarget) => {
      if (shouldSkipNavigation(target)) return;

      const key = navigationKey(target);
      const now = Date.now();
      const last = lastNavigationRef.current;
      if (last && last.key === key && now - last.at < 1500) return;
      lastNavigationRef.current = { key, at: now };
      routerRef.current.push(overlayActivityToHref(target));
    };

    const handleUrl = (url: string | null) => {
      if (!url) return;
      const target = parseOverlayDeepLink(url);
      if (target) navigate(target);
    };

    void Linking.getInitialURL().then(handleUrl);
    const linkingSub = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });
    const overlaySub = subscribeOverlayOpened(navigate);

    return () => {
      linkingSub.remove();
      overlaySub();
    };
  }, []);
}
