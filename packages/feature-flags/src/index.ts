export type FeatureFlag =
  | 'integrations.google'
  | 'integrations.whatsapp'
  | 'integrations.files'
  | 'integrations.notes'
  | 'workflows.enabled'
  | 'tool-runtime.streaming'
  | 'ai.multi-agent'
  | 'mobile.offline-sync';

const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  'integrations.google': true,
  'integrations.whatsapp': true,
  'integrations.files': true,
  'integrations.notes': true,
  'workflows.enabled': true,
  'tool-runtime.streaming': true,
  'ai.multi-agent': false,
  'mobile.offline-sync': true,
};

const overrides = new Map<string, Partial<Record<FeatureFlag, boolean>>>();

export function setUserFeatureOverrides(
  userId: string,
  flags: Partial<Record<FeatureFlag, boolean>>
): void {
  overrides.set(userId, { ...overrides.get(userId), ...flags });
}

export function isFeatureEnabled(flag: FeatureFlag, userId?: string): boolean {
  if (userId) {
    const userFlags = overrides.get(userId);
    if (userFlags && flag in userFlags) {
      return userFlags[flag]!;
    }
  }
  const envKey = `FF_${flag.replace(/\./g, '_').toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal !== undefined) return envVal === 'true' || envVal === '1';
  return DEFAULT_FLAGS[flag] ?? false;
}
