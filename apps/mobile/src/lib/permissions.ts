import type { PermissionStatus } from '@/features/voice/requestVoicePermissions';

const MIC_STATUS_LABELS: Record<PermissionStatus, string> = {
  granted: 'Granted',
  denied: 'Denied',
  undetermined: 'Not requested',
};

export function formatMicPermissionStatus(status: PermissionStatus): string {
  return MIC_STATUS_LABELS[status];
}

export type OverlayPermissionLabel = 'Granted' | 'Not granted' | 'Unknown';

export function formatOverlayPermission(granted: boolean): OverlayPermissionLabel {
  return granted ? 'Granted' : 'Not granted';
}
