import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { router, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useDrawerProgress } from 'react-native-drawer-layout';
import { useDrawerNavigation } from '@/hooks/useDrawerNavigation';
import { Routes } from '@/lib/routes';

const SWIPE_DISTANCE = 56;
const SWIPE_VELOCITY = 500;
const POST_CLOSE_TOUCH_LOCK_MS = 350;

type AppNavigationGestureHostProps = {
  children: ReactNode;
};

export function AppNavigationGestureHost({ children }: AppNavigationGestureHostProps) {
  const pathname = usePathname();
  const { openDrawer, closeDrawer, hasDrawer } = useDrawerNavigation();
  const drawerProgress = useDrawerProgress();
  const onSettingsScreen = pathname.includes('/settings');
  const onSchedulerScreen = pathname.includes('/automations');
  const [drawerGestureActive, setDrawerGestureActive] = useState(false);
  const [touchLocked, setTouchLocked] = useState(false);
  const drawerOpenRef = useRef(false);
  const touchLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lockTouchesBriefly = useCallback(() => {
    setTouchLocked(true);
    if (touchLockTimerRef.current) clearTimeout(touchLockTimerRef.current);
    touchLockTimerRef.current = setTimeout(() => {
      setTouchLocked(false);
      touchLockTimerRef.current = null;
    }, POST_CLOSE_TOUCH_LOCK_MS);
  }, []);

  useAnimatedReaction(
    () => drawerProgress.value > 0.01,
    (active, previous) => {
      if (previous === null || active === previous) return;
      scheduleOnRN(setDrawerGestureActive, active);
    },
    [drawerProgress]
  );

  useAnimatedReaction(
    () => drawerProgress.value,
    (current, previous) => {
      if (previous === null || previous <= 0.01 || current > 0.01) return;
      scheduleOnRN(lockTouchesBriefly);
    },
    [drawerProgress, lockTouchesBriefly]
  );

  useEffect(
    () => () => {
      if (touchLockTimerRef.current) clearTimeout(touchLockTimerRef.current);
    },
    []
  );

  const drawerBlocksTouches = drawerGestureActive || touchLocked;

  useEffect(() => {
    drawerOpenRef.current = drawerGestureActive;
  }, [drawerGestureActive]);

  const enabled = hasDrawer && !onSchedulerScreen && !onSettingsScreen;

  const handlePanEnd = useCallback(
    (translationX: number, velocityX: number) => {
      const swipeRight = translationX >= SWIPE_DISTANCE || velocityX >= SWIPE_VELOCITY;
      const swipeLeft = translationX <= -SWIPE_DISTANCE || velocityX <= -SWIPE_VELOCITY;

      if (drawerOpenRef.current) {
        if (swipeLeft) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          closeDrawer();
        }
        return;
      }

      if (swipeRight) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        openDrawer();
        return;
      }

      if (swipeLeft) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(Routes.settings);
      }
    },
    [closeDrawer, openDrawer]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-28, 28])
        .failOffsetY([-22, 22])
        .onEnd((event) => {
          'worklet';
          scheduleOnRN(handlePanEnd, event.translationX, event.velocityX);
        }),
    [enabled, handlePanEnd]
  );

  if (!hasDrawer || onSchedulerScreen) {
    return <Animated.View style={styles.fill}>{children}</Animated.View>;
  }

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={styles.fill} collapsable={false}>
        <Animated.View
          style={styles.fill}
          pointerEvents={drawerBlocksTouches ? 'none' : 'auto'}>
          {children}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
