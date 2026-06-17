import { useMemo } from 'react';
import { resolvePersonalityIcon, type IconSpec } from '@ai-assistant/icons';
import { getPersonalityPreset, useSettingsStore } from '@/stores/settings';

export type AssistantIdentity = {
  personalityId: string;
  displayName: string;
  name: string;
  tagline: string;
  gender: string;
  iconSpec: IconSpec;
};

export function useAssistantIdentity(
  personalityId?: string | null,
  sessionDisplayName?: string | null
): AssistantIdentity {
  const selectedPersonalityId = useSettingsStore((s) => s.selectedPersonalityId);
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const personalities = useSettingsStore((s) => s.personalities);

  return useMemo(() => {
    const resolvedId = personalityId ?? selectedPersonalityId;
    const preset = getPersonalityPreset(resolvedId, personalities);
    const displayName =
      sessionDisplayName?.trim() ||
      (personalityId && personalityId !== selectedPersonalityId
        ? preset.name
        : assistantDisplayName);

    return {
      personalityId: preset.id,
      displayName,
      name: preset.name,
      tagline: preset.tagline,
      gender: preset.gender,
      iconSpec: resolvePersonalityIcon(preset.id, preset.gender),
    };
  }, [
    assistantDisplayName,
    personalities,
    personalityId,
    selectedPersonalityId,
    sessionDisplayName,
  ]);
}
