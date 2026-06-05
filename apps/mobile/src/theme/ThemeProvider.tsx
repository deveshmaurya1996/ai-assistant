import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme as useSystemColorScheme, View, type ViewStyle } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { getItemAsync, setItemAsync } from '@/lib/secure-storage';
import { StatusBar } from 'expo-status-bar';
import {
  palettes,
  type ColorScheme,
  type ThemeColors,
  type ThemeMode,
} from './tokens';

const THEME_KEY = 'app_theme_mode';

type ThemeContextValue = {
  mode: ThemeMode;
  colorScheme: ColorScheme;
  colors: ThemeColors;
  screenStyle: ViewStyle;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    void getItemAsync(THEME_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored);
      }
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void setItemAsync(THEME_KEY, next);
  }, []);

  const colorScheme: ColorScheme =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo(() => {
    const colors = palettes[colorScheme];
    return {
      mode,
      colorScheme,
      colors,
      screenStyle: { flex: 1, backgroundColor: colors.background } satisfies ViewStyle,
      setMode,
      isDark: colorScheme === 'dark',
    };
  }, [mode, colorScheme, setMode]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(value.colors.background);
  }, [value.colors.background]);

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={value.isDark ? 'light' : 'dark'} />
      <View style={value.screenStyle}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
