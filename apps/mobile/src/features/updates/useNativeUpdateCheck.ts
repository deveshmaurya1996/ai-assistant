import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiClient, type MobileVersionInfo } from '@/lib/api-client';
import {
  compareSemver,
  getAndroidVersionCode,
  getMarketingVersion,
} from '@/lib/app-version';

const DISMISSED_VERSION_KEY = 'mobile_update_dismissed_version';

export type NativeUpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'optional'; info: MobileVersionInfo }
  | { kind: 'required'; info: MobileVersionInfo };

function isBelowMin(
  marketing: string,
  androidCode: number | null,
  info: MobileVersionInfo
): boolean {
  if (compareSemver(marketing, info.minVersion) < 0) return true;
  if (
    Platform.OS === 'android' &&
    androidCode !== null &&
    androidCode < info.minAndroidVersionCode
  ) {
    return true;
  }
  return false;
}

function hasOptionalUpdate(marketing: string, info: MobileVersionInfo): boolean {
  return compareSemver(marketing, info.latestVersion) < 0;
}

export function useNativeUpdateCheck(enabled: boolean) {
  const [state, setState] = useState<NativeUpdateState>({ kind: 'idle' });

  const check = useCallback(async () => {
    if (!enabled || Platform.OS === 'web' || __DEV__) {
      setState({ kind: 'none' });
      return;
    }

    setState({ kind: 'checking' });
    try {
      const info = await apiClient.getMobileVersion();
      const marketing = getMarketingVersion();
      const androidCode = getAndroidVersionCode();

      if (!info.updateUrl) {
        setState({ kind: 'none' });
        return;
      }

      if (isBelowMin(marketing, androidCode, info)) {
        setState({ kind: 'required', info });
        return;
      }

      if (!hasOptionalUpdate(marketing, info)) {
        setState({ kind: 'none' });
        return;
      }

      const dismissed = await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
      if (dismissed === info.latestVersion) {
        setState({ kind: 'none' });
        return;
      }

      setState({ kind: 'optional', info });
    } catch {
      setState({ kind: 'none' });
    }
  }, [enabled]);

  const dismissOptional = useCallback(async () => {
    if (state.kind !== 'optional') return;
    await AsyncStorage.setItem(DISMISSED_VERSION_KEY, state.info.latestVersion);
    setState({ kind: 'none' });
  }, [state]);

  useEffect(() => {
    void check();
  }, [check]);

  return { state, dismissOptional, recheck: check };
}
