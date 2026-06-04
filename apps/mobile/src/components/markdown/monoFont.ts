import { Platform } from 'react-native';

export const monoFontFamily = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, Menlo, Consolas, monospace',
});
