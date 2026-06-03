import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import {
  subscribeOverlayOpened,
  type OverlayNavigationTarget,
} from '@/lib/overlay';
import {
  overlayActivityToHref,
  parseOverlayDeepLink,
} from './resolveOverlayRoute';

function navigationKey(target: OverlayNavigationTarget): string {
  return `${target.kind}:${target.sessionKey}`;
}

export function useOverlayOpenNavigation() {
  const router = useRouter();
  const routerRef = useRef(router);
  const lastNavigationRef = useRef<{ key: string; at: number } | null>(null);
  routerRef.current = router;

  useEffect(() => {
    const navigate = (target: OverlayNavigationTarget) => {
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
