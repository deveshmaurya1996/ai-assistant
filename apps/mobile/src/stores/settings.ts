import { create } from 'zustand';
import {
  ASSISTANT_PERSONALITIES,
  ASSISTANT_NAME_MAX_LENGTH,
  DEFAULT_ASSISTANT_PERSONALITY_ID,
  canCustomizeAssistantDisplayName,
  formatPersonalityGender,
  getAssistantPersonality,
  resolvePersonalityVoiceId,
  reconcileDisplayName,
  type AssistantPersonality,
  type PersonalityGender,
} from '@ai-assistant/types';
import { deleteItemAsync, getItemAsync, setItemAsync } from '@/lib/secure-storage';
import { reconcileStoredOverlayEnabled } from '@/lib/overlay-settings';
import { apiClient } from '@/lib/api-client';
import type { ModelInfo } from '@ai-assistant/types';
import type { ThemeMode } from '@/theme/tokens';
import { TERMS_VERSION } from '@/content/terms';

const KEYS = {
  termsAccepted: 'terms_accepted_at',
  termsVersion: 'terms_version',
  speakReplies: 'speak_replies_enabled',
  selectedPersonality: 'selected_personality_id',
  assistantDisplayName: 'assistant_display_name',
  selectedAgent: 'selected_agent_id',
  backgroundVoice: 'background_voice_enabled',
  autoSendVoice: 'auto_send_voice',
  overlayEnabled: 'overlay_enabled',
  voiceOverlayEnabled: 'voice_overlay_enabled',
  reminderOverlayEnabled: 'reminder_overlay_enabled',
  lastAiModelLabel: 'last_ai_model_label',
  lastTranscript: 'last_transcript',
} as const;

export type { PersonalityGender, AssistantPersonality };
export { ASSISTANT_NAME_MAX_LENGTH };
export const PERSONALITY_PRESETS = ASSISTANT_PERSONALITIES;
export type PersonalityId = string;

export function formatGenderLabel(gender: PersonalityGender): string {
  return formatPersonalityGender(gender);
}

export function getPersonalityPreset(id: string, personalities = ASSISTANT_PERSONALITIES) {
  return personalities.find((p) => p.id === id) ?? personalities[0] ?? getAssistantPersonality(id);
}

export function getAssistantSubtitle(
  assistantDisplayName: string,
  selectedPersonalityId: string,
  personalities = ASSISTANT_PERSONALITIES
): string {
  const preset = getPersonalityPreset(selectedPersonalityId, personalities);
  return `${assistantDisplayName} · ${preset.tagline}`;
}

type SettingsState = {
  hydrated: boolean;
  personalities: AssistantPersonality[];
  termsAcceptedAt: string | null;
  speakRepliesEnabled: boolean;
  assistantDisplayName: string;
  selectedPersonalityId: PersonalityId;
  assistantContinuousListening: boolean;
  autoSendAfterTranscribe: boolean;
  overlayEnabled: boolean;
  voiceOverlayEnabled: boolean;
  reminderOverlayEnabled: boolean;
  lastAiModelLabel: string | null;
  preferredModelId: string | null;
  modelsCatalog: ModelInfo[] | null;
  modelsLoading: boolean;
  lastTranscript: string | null;
  hydrate: () => Promise<void>;
  acceptTerms: () => Promise<void>;
  hasAcceptedTerms: () => boolean;
  setSpeakRepliesEnabled: (v: boolean) => Promise<void>;
  setAssistantDisplayName: (name: string) => Promise<void>;
  setSelectedPersonalityId: (id: PersonalityId) => Promise<void>;
  setAssistantContinuousListening: (v: boolean) => Promise<void>;
  setAutoSend: (v: boolean) => Promise<void>;
  setOverlayEnabled: (v: boolean) => Promise<void>;
  setVoiceOverlayEnabled: (v: boolean) => Promise<void>;
  setReminderOverlayEnabled: (v: boolean) => Promise<void>;
  setLastAiModelLabel: (label: string | null) => Promise<void>;
  loadModels: () => Promise<void>;
  setPreferredModelId: (modelId: string | null) => Promise<void>;
  setLastTranscript: (text: string | null) => Promise<void>;
  getSelectedTtsVoice: () => string;
};

function normalizePersonalityId(
  raw: string | null,
  personalities: AssistantPersonality[]
): PersonalityId {
  if (raw && personalities.some((p) => p.id === raw)) {
    return raw;
  }
  return personalities[0]?.id ?? 'assistant';
}

function normalizeDisplayName(
  raw: string | null,
  personalityId: PersonalityId,
  personalities: AssistantPersonality[]
): string {
  return reconcileDisplayName(
    personalityId,
    raw?.trim() ? raw.trim().slice(0, ASSISTANT_NAME_MAX_LENGTH) : null
  );
}

async function fetchPersonalities(): Promise<AssistantPersonality[]> {
  try {
    const data = await apiClient.listPersonalities();
    if (data.personalities?.length) {
      return data.personalities;
    }
  } catch {
    /* offline or unauthenticated — use bundled fallback */
  }
  return ASSISTANT_PERSONALITIES;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hydrated: false,
  personalities: ASSISTANT_PERSONALITIES,
  termsAcceptedAt: null,
  speakRepliesEnabled: true,
  assistantDisplayName: 'Assistant',
  selectedPersonalityId: 'assistant',
  assistantContinuousListening: true,
  autoSendAfterTranscribe: false,
  overlayEnabled: false,
  voiceOverlayEnabled: false,
  reminderOverlayEnabled: false,
  lastAiModelLabel: null,
  preferredModelId: null,
  modelsCatalog: null,
  modelsLoading: false,
  lastTranscript: null,

  hydrate: async () => {
    try {
      const [
        personalities,
        termsAccepted,
        termsVersion,
        speakReplies,
        selectedPersonality,
        assistantName,
        legacyAgent,
        backgroundVoice,
        autoSend,
        overlay,
        voiceOverlay,
        reminderOverlay,
        lastModel,
        transcript,
      ] = await Promise.all([
        fetchPersonalities(),
        getItemAsync(KEYS.termsAccepted),
        getItemAsync(KEYS.termsVersion),
        getItemAsync(KEYS.speakReplies),
        getItemAsync(KEYS.selectedPersonality),
        getItemAsync(KEYS.assistantDisplayName),
        getItemAsync(KEYS.selectedAgent),
        getItemAsync(KEYS.backgroundVoice),
        getItemAsync(KEYS.autoSendVoice),
        getItemAsync(KEYS.overlayEnabled),
        getItemAsync(KEYS.voiceOverlayEnabled),
        getItemAsync(KEYS.reminderOverlayEnabled),
        getItemAsync(KEYS.lastAiModelLabel),
        getItemAsync(KEYS.lastTranscript),
      ]);

      const personalityId = normalizePersonalityId(
        selectedPersonality ?? legacyAgent,
        personalities
      );

      const assistantDisplayName = normalizeDisplayName(
        assistantName,
        personalityId,
        personalities
      );
      if (assistantName?.trim() && assistantDisplayName !== assistantName.trim()) {
        await setItemAsync(KEYS.assistantDisplayName, assistantDisplayName);
      }

      const overlayEnabled = await reconcileStoredOverlayEnabled(overlay === 'true');
      if (overlay === 'true' && !overlayEnabled) {
        await setItemAsync(KEYS.overlayEnabled, 'false');
      }

      const voiceOverlayEnabled = await reconcileStoredOverlayEnabled(
        voiceOverlay === 'true'
      );
      if (voiceOverlay === 'true' && !voiceOverlayEnabled) {
        await setItemAsync(KEYS.voiceOverlayEnabled, 'false');
      }

      set({
        hydrated: true,
        personalities,
        termsAcceptedAt:
          termsVersion === TERMS_VERSION && termsAccepted ? termsAccepted : null,
        speakRepliesEnabled: speakReplies !== 'false',
        selectedPersonalityId: personalityId,
        assistantDisplayName,
        assistantContinuousListening: backgroundVoice !== 'false',
        autoSendAfterTranscribe: autoSend === 'true',
        overlayEnabled,
        voiceOverlayEnabled,
        reminderOverlayEnabled: reminderOverlay === 'true',
        lastAiModelLabel: lastModel,
        lastTranscript: transcript,
      });
    } catch {
      set({ hydrated: true, personalities: ASSISTANT_PERSONALITIES });
    }
  },

  acceptTerms: async () => {
    const at = new Date().toISOString();
    await setItemAsync(KEYS.termsAccepted, at);
    await setItemAsync(KEYS.termsVersion, TERMS_VERSION);
    set({ termsAcceptedAt: at });
  },

  hasAcceptedTerms: () => {
    const { termsAcceptedAt } = get();
    return Boolean(termsAcceptedAt);
  },

  setSpeakRepliesEnabled: async (v) => {
    await setItemAsync(KEYS.speakReplies, String(v));
    set({ speakRepliesEnabled: v });
  },

  setAssistantDisplayName: async (name) => {
    const { selectedPersonalityId } = get();
    if (!canCustomizeAssistantDisplayName(selectedPersonalityId)) {
      return;
    }
    const value = reconcileDisplayName(
      selectedPersonalityId,
      name.trim().slice(0, ASSISTANT_NAME_MAX_LENGTH) || null
    );
    await setItemAsync(KEYS.assistantDisplayName, value);
    set({ assistantDisplayName: value });
  },

  setSelectedPersonalityId: async (id) => {
    const { personalities } = get();
    const preset = getPersonalityPreset(id, personalities);
    await setItemAsync(KEYS.selectedPersonality, id);

    if (id === DEFAULT_ASSISTANT_PERSONALITY_ID) {
      const stored = await getItemAsync(KEYS.assistantDisplayName);
      const assistantDisplayName = normalizeDisplayName(stored, id, personalities);
      set({
        selectedPersonalityId: id,
        assistantDisplayName,
      });
      return;
    }

    set({
      selectedPersonalityId: id,
      assistantDisplayName: preset.name,
    });
  },

  setAssistantContinuousListening: async (v) => {
    await setItemAsync(KEYS.backgroundVoice, String(v));
    set({ assistantContinuousListening: v });
  },

  setAutoSend: async (v) => {
    await setItemAsync(KEYS.autoSendVoice, String(v));
    set({ autoSendAfterTranscribe: v });
  },

  setOverlayEnabled: async (v) => {
    await setItemAsync(KEYS.overlayEnabled, String(v));
    set({ overlayEnabled: v });
  },

  setVoiceOverlayEnabled: async (v) => {
    await setItemAsync(KEYS.voiceOverlayEnabled, String(v));
    set({ voiceOverlayEnabled: v });
  },

  setReminderOverlayEnabled: async (v) => {
    await setItemAsync(KEYS.reminderOverlayEnabled, String(v));
    set({ reminderOverlayEnabled: v });
  },

  setLastAiModelLabel: async (label) => {
    const value = label?.trim() || null;
    if (value) {
      await setItemAsync(KEYS.lastAiModelLabel, value);
    } else {
      await deleteItemAsync(KEYS.lastAiModelLabel);
    }
    set({ lastAiModelLabel: value });
  },

  loadModels: async () => {
    set({ modelsLoading: true });
    try {
      const data = await apiClient.getModels('fast_chat');
      set({
        modelsCatalog: data.models ?? [],
        preferredModelId: data.preferredModelId ?? null,
        modelsLoading: false,
      });
    } catch {
      set({ modelsLoading: false });
    }
  },

  setPreferredModelId: async (modelId) => {
    await apiClient.setPreferredModel(modelId);
    set({ preferredModelId: modelId });
  },

  setLastTranscript: async (text) => {
    if (text) {
      await setItemAsync(KEYS.lastTranscript, text);
    } else {
      await deleteItemAsync(KEYS.lastTranscript);
    }
    set({ lastTranscript: text });
  },

  getSelectedTtsVoice: () => {
    const { selectedPersonalityId } = get();
    return resolvePersonalityVoiceId(getAssistantPersonality(selectedPersonalityId));
  },
}));
