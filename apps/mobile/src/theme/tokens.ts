import { splashBackground } from './brand.constants.js';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ColorScheme = 'light' | 'dark';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 28,
  full: 999,
} as const;

export const layout = {
  headerHeight: 56,
  dockHeight: 72,
  dockBottomOffset: 12,
  maxContentWidth: 800,
} as const;

export const typography = {
  h1: { fontSize: 28, lineHeight: 34, fontFamily: 'Inter_700Bold' },
  h2: { fontSize: 22, lineHeight: 28, fontFamily: 'Inter_600SemiBold' },
  body: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_400Regular' },
  bodyMedium: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_500Medium' },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  label: { fontSize: 12, lineHeight: 16, fontFamily: 'Inter_500Medium' },
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryMuted: string;
  onPrimary: string;
  danger: string;
  success: string;
  dockBlur: string;
  overlay: string;
};

export const palettes: Record<ColorScheme, ThemeColors> = {
  light: {
    background: '#F4F5F7',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    border: '#E4E6EB',
    text: '#111318',
    textMuted: '#6B7280',
    primary: '#4F46E5',
    primaryMuted: '#EEF2FF',
    onPrimary: '#FFFFFF',
    danger: '#DC2626',
    success: '#16A34A',
    dockBlur: 'light',
    overlay: 'rgba(0,0,0,0.4)',
  },
  dark: {
    background: splashBackground,
    surface: '#151820',
    surfaceElevated: '#1C2030',
    border: '#2A3040',
    text: '#F3F4F6',
    textMuted: '#9CA3AF',
    primary: '#818CF8',
    primaryMuted: '#1E1B4B',
    onPrimary: splashBackground,
    danger: '#F87171',
    success: '#4ADE80',
    dockBlur: 'dark',
    overlay: 'rgba(0,0,0,0.6)',
  },
};

export { splashBackground };
