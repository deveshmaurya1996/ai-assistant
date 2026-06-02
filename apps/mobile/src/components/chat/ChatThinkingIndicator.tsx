import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import {
  buildThinkingPhrases,
  pickFunnyThinkingLine,
  THINKING_FUNNY_AFTER_MS,
  THINKING_PHRASE_INTERVAL_MS,
} from '@/features/chat/buildThinkingPhrases';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const BALL_SIZE = 9;
const BOUNCE_HEIGHT = 7;
const BOUNCE_DOWN_MS = 240;
const BOUNCE_UP_MS = 240;

type Props = {
  userMessage?: string;
  assistantLabel?: string;
};

export function ChatThinkingIndicator({
  userMessage = '',
  assistantLabel,
}: Props) {
  const { colors } = useTheme();
  const phrases = useMemo(() => buildThinkingPhrases(userMessage), [userMessage]);
  const [statusText, setStatusText] = useState(() => phrases[0] ?? 'Thinking');
  const thinkingPrefix = assistantLabel?.trim() || 'Assistant';
  const startedAt = useRef(Date.now());
  const phraseIndex = useRef(0);
  const recentFunny = useRef(new Set<string>());
  const translateY = useSharedValue(0);
  const scaleY = useSharedValue(1);
  const labelOpacity = useSharedValue(0.7);

  useEffect(() => {
    startedAt.current = Date.now();
    phraseIndex.current = 0;
    recentFunny.current.clear();
    setStatusText(phrases[0] ?? 'Thinking');
  }, [phrases, userMessage]);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-BOUNCE_HEIGHT, {
          duration: BOUNCE_UP_MS,
          easing: Easing.out(Easing.cubic),
        }),
        withTiming(0, {
          duration: BOUNCE_DOWN_MS,
          easing: Easing.in(Easing.quad),
        })
      ),
      -1,
      false
    );
    scaleY.value = withRepeat(
      withSequence(
        withTiming(0.92, { duration: BOUNCE_DOWN_MS }),
        withTiming(1, { duration: BOUNCE_UP_MS, easing: Easing.out(Easing.cubic) })
      ),
      -1,
      false
    );
  }, [scaleY, translateY]);

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;

      if (elapsed >= THINKING_FUNNY_AFTER_MS) {
        setStatusText(pickFunnyThinkingLine(recentFunny.current));
        return;
      }

      if (phraseIndex.current < phrases.length - 1) {
        phraseIndex.current += 1;
        setStatusText(phrases[phraseIndex.current]!);
      }
    }, THINKING_PHRASE_INTERVAL_MS);

    return () => clearInterval(id);
  }, [phrases]);

  useEffect(() => {
    labelOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.55, { duration: 600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [labelOpacity]);

  const ballStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scaleY: scaleY.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
  }));

  return (
    <View style={styles.row}>
      <View style={styles.bounceLane}>
        <Animated.View
          style={[
            styles.ball,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
            },
            ballStyle,
          ]}
        />
      </View>
      <Animated.View style={labelStyle}>
        <Text variant="body" muted numberOfLines={1}>
          {`${thinkingPrefix} · ${statusText}…`}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 22,
    maxWidth: '100%',
  },
  bounceLane: {
    width: BALL_SIZE + 4,
    height: BOUNCE_HEIGHT + BALL_SIZE + 2,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  ball: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 5,
    elevation: 3,
  },
});
