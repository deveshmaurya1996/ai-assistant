import { prisma } from '@ai-assistant/database';
import {
  DEFAULT_ASSISTANT_PERSONALITY_ID,
  getVoiceProfileForPersonality,
  normalizeVoiceProfileId,
  type UserVoiceSettings,
} from '@ai-assistant/types';

export async function loadUserVoiceSettings(userId: string): Promise<UserVoiceSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  const settings =
    user?.settings && typeof user.settings === 'object'
      ? (user.settings as Record<string, unknown>)
      : {};
  const voice =
    settings.voice && typeof settings.voice === 'object'
      ? (settings.voice as UserVoiceSettings)
      : {};
  return voice;
}

export function resolveVoiceProfileId(
  explicitProfileId: string | undefined,
  personalityId: string | undefined,
  userSettings: UserVoiceSettings
): string {
  if (personalityId?.trim()) return normalizeVoiceProfileId(personalityId);
  if (explicitProfileId?.trim()) return normalizeVoiceProfileId(explicitProfileId);
  if (userSettings.voiceProfileId?.trim()) {
    return normalizeVoiceProfileId(userSettings.voiceProfileId);
  }
  return DEFAULT_ASSISTANT_PERSONALITY_ID;
}

export function resolveVoiceMaxSentences(
  profileId: string,
  userSettings: UserVoiceSettings
): number {
  const profile = getVoiceProfileForPersonality(normalizeVoiceProfileId(profileId));
  const base = profile.maxSentences;
  if (userSettings.prefersShortAnswers) return Math.min(base, 2);
  return base;
}

export function resolvePersonalityIdFromVoiceProfile(profileId: string): string {
  return normalizeVoiceProfileId(profileId);
}
