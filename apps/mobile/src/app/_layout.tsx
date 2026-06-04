import 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AppSplash } from '@/components/boot/AppSplash';
import { hydrateAuthStorage } from '@/lib/secure-storage';
import { useAppBootstrap } from '@/hooks/useAppBootstrap';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 280 });

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const bootstrapReady = useAppBootstrap(fontsLoaded);
  const [splashDone, setSplashDone] = useState(false);
  const appReady = bootstrapReady && splashDone;

  useEffect(() => {
    void hydrateAuthStorage();
  }, []);

  useEffect(() => {
    if (appReady) {
      void SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) {
    return (
      <ThemeProvider>
        <AppSplash playVideo onComplete={() => setSplashDone(true)} />
      </ThemeProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <BottomSheetModalProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
          </Stack>
        </BottomSheetModalProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
