import { useCallback, useEffect, useRef } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTheme } from '@/theme/ThemeProvider';

const SPLASH_LOGO = require('../../../assets/images/splash-icon.png');
const SPLASH_VIDEO = require('../../../assets/images/splash-video.mp4');

const SPLASH_MAX_MS = 8000;

type Props = {
  onComplete?: () => void;
  playVideo?: boolean;
};

let introVideoPlayed = false;

export function AppSplash({ onComplete, playVideo = false }: Props) {
  const { colors } = useTheme();
  const finishedRef = useRef(false);
  const shouldPlayVideo =
    playVideo && !introVideoPlayed && Platform.OS !== 'web';

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (shouldPlayVideo) introVideoPlayed = true;
    onComplete?.();
  }, [onComplete, shouldPlayVideo]);

  useEffect(() => {
    if (!shouldPlayVideo) {
      finish();
    }
  }, [shouldPlayVideo, finish]);

  if (shouldPlayVideo) {
    return <SplashVideo onComplete={finish} backgroundColor={colors.background} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Image
        source={SPLASH_LOGO}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="AI Assistant"
      />
    </View>
  );
}

function SplashVideo({
  onComplete,
  backgroundColor,
}: {
  onComplete: () => void;
  backgroundColor: string;
}) {
  const player = useVideoPlayer(SPLASH_VIDEO, (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    const maxTimer = setTimeout(onComplete, SPLASH_MAX_MS);
    return () => clearTimeout(maxTimer);
  }, [onComplete]);

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      onComplete();
    });
    return () => sub.remove();
  }, [player, onComplete]);

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status, error }) => {
      if (error) onComplete();
      if (status === 'readyToPlay') {
        void SplashScreen.hideAsync();
      }
    });
    return () => sub.remove();
  }, [player, onComplete]);

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={false}
        contentFit="contain"
        allowsPictureInPicture={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: 160,
    height: 160,
  },
  logo: {
    width: 160,
    height: 160,
  },
});
