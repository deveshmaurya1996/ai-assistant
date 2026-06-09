import { create } from 'zustand';
import type { LocalFileSyncProgress } from './types';

type DeviceFilesSyncState = {
  syncInProgress: boolean;
  progress: LocalFileSyncProgress | null;
  setSyncInProgress: (value: boolean) => void;
  setProgress: (progress: LocalFileSyncProgress | null) => void;
};

export const useDeviceFilesSyncStore = create<DeviceFilesSyncState>((set) => ({
  syncInProgress: false,
  progress: null,
  setSyncInProgress: (syncInProgress) => set({ syncInProgress }),
  setProgress: (progress) => set({ progress }),
}));

export function isDeviceFilesSyncRunning(): boolean {
  return useDeviceFilesSyncStore.getState().syncInProgress;
}
