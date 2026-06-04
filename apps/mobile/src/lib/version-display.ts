import * as Updates from 'expo-updates';
import { formatVersionLabel, getNativeBuildVersion } from '@/lib/app-version';

export function getVersionDisplayLines(): { primary: string; secondary: string | null } {
  const primary = formatVersionLabel();
  if (__DEV__ || !Updates.isEnabled) {
    return { primary, secondary: null };
  }

  const parts: string[] = [];
  const build = getNativeBuildVersion();
  if (build) parts.push(`Build ${build}`);
  if (Updates.updateId) parts.push(`Update ${Updates.updateId.slice(0, 8)}`);

  return {
    primary,
    secondary: parts.length > 0 ? parts.join(' · ') : null,
  };
}
