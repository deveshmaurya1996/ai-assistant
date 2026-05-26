import { create } from 'zustand';
import { deleteItemAsync, getItemAsync, setItemAsync } from '@/lib/secure-storage';
import type { ThemeMode } from '@/theme/tokens';
import { TERMS_VERSION } from '@/content/terms';
import { apiClient } from '@/lib/api-client';

const KEYS = {
  termsAccepted: 'terms_accepted_at',
  termsVersion: 'terms_version',
  speakReplies: 'speak_replies_enabled',
  selectedPersonality: 'selected_personality_id',
  assistantDisplayName: 'assistant_display_name',
  selectedAgent: 'selected_agent_id',
  backgroundVoice: 'background_voice_enabled',
  autoSendVoice: 'auto_send_voice',
  defaultRag: 'default_rag_enabled',
  overlayEnabled: 'overlay_enabled',
  preferredModel: 'preferred_model',
  lastTranscript: 'last_transcript',
} as const;

export type PersonalityGender = 'female' | 'male' | 'neutral';

export const PERSONALITY_PRESETS = [
  {
    id: 'assistant',
    name: 'Assistant',
    gender: 'neutral' as PersonalityGender,
    tagline: 'Helpful and balanced',
  },
  {
    id: 'friday',
    name: 'Friday',
    gender: 'female' as PersonalityGender,
    tagline: 'Friendly, professional',
  },
  {
    id: 'jarvis',
    name: 'Jarvis',
    gender: 'male' as PersonalityGender,
    tagline: 'Concise, crisp',
  },
  {
    id: 'nova',
    name: 'Nova',
    gender: 'female' as PersonalityGender,
    tagline: 'Warm, upbeat',
  },
  {
    id: 'ghost',
    name: 'Ghost',
    gender: 'neutral' as PersonalityGender,
    tagline: 'Calm, minimal',
  },
] as const;

export type PersonalityId = (typeof PERSONALITY_PRESETS)[number]['id'];

/** @deprecated Use PERSONALITY_PRESETS */
export const AGENT_PRESETS = PERSONALITY_PRESETS.map((p) => ({ id: p.id, name: p.name }));
export type AgentId = PersonalityId;

export const ASSISTANT_NAME_MAX_LENGTH = 24;

export function formatGenderLabel(gender: PersonalityGender): string {
  switch (gender) {
    case 'female':
      return 'Female';
    case 'male':
      return 'Male';
    default:
      return 'Neutral';
  }
}

export function getPersonalityPreset(id: string) {
  return PERSONALITY_PRESETS.find((p) => p.id === id) ?? PERSONALITY_PRESETS[0];
}

type SettingsState = {
  hydrated: boolean;
  termsAcceptedAt: string | null;
  speakRepliesEnabled: boolean;
  assistantDisplayName: string;
  selectedPersonalityId: PersonalityId;
  assistantContinuousListening: boolean;
  autoSendAfterTranscribe: boolean;
  defaultRagEnabled: boolean;
  overlayEnabled: boolean;
  preferredModel: string | null;
  lastTranscript: string | null;
  hydrate: () => Promise<void>;
  acceptTerms: () => Promise<void>;
  hasAcceptedTerms: () => boolean;
  setSpeakRepliesEnabled: (v: boolean) => Promise<void>;
  setAssistantDisplayName: (name: string) => Promise<void>;
  setSelectedPersonalityId: (id: PersonalityId) => Promise<void>;
  setAssistantContinuousListening: (v: boolean) => Promise<void>;
  setAutoSend: (v: boolean) => Promise<void>;
  setDefaultRag: (v: boolean) => Promise<void>;
  setOverlayEnabled: (v: boolean) => Promise<void>;
  setPreferredModel: (model: string) => Promise<void>;
  loadPreferredModelFromApi: () => Promise<void>;
  setLastTranscript: (text: string | null) => Promise<void>;
};

function normalizePersonalityId(raw: string | null): PersonalityId {
  if (raw && PERSONALITY_PRESETS.some((p) => p.id === raw)) {
    return raw as PersonalityId;
  }
  return 'assistant';
}

function normalizeDisplayName(raw: string | null, personalityId: PersonalityId): string {
  const trimmed = raw?.trim();
  if (trimmed) {
    return trimmed.slice(0, ASSISTANT_NAME_MAX_LENGTH);
  }
  return getPersonalityPreset(personalityId).name;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hydrated: false,
  termsAcceptedAt: null,
  speakRepliesEnabled: true,
  assistantDisplayName: 'Assistant',
  selectedPersonalityId: 'assistant',
  assistantContinuousListening: true,
  autoSendAfterTranscribe: false,
  defaultRagEnabled: true,
  overlayEnabled: false,
  preferredModel: null,
  lastTranscript: null,

  hydrate: async () => {
    try {
      const [
        termsAccepted,
        termsVersion,
        speakReplies,
        selectedPersonality,
        assistantName,
        legacyAgent,
        backgroundVoice,
        autoSend,
        defaultRag,
        overlay,
        model,
        transcript,
      ] = await Promise.all([
        getItemAsync(KEYS.termsAccepted),
        getItemAsync(KEYS.termsVersion),
        getItemAsync(KEYS.speakReplies),
        getItemAsync(KEYS.selectedPersonality),
        getItemAsync(KEYS.assistantDisplayName),
        getItemAsync(KEYS.selectedAgent),
        getItemAsync(KEYS.backgroundVoice),
        getItemAsync(KEYS.autoSendVoice),
        getItemAsync(KEYS.defaultRag),
        getItemAsync(KEYS.overlayEnabled),
        getItemAsync(KEYS.preferredModel),
        getItemAsync(KEYS.lastTranscript),
      ]);

      const personalityId = normalizePersonalityId(
        selectedPersonality ?? legacyAgent
      );

      set({
        hydrated: true,
        termsAcceptedAt:
          termsVersion === TERMS_VERSION && termsAccepted ? termsAccepted : null,
        speakRepliesEnabled: speakReplies !== 'false',
        selectedPersonalityId: personalityId,
        assistantDisplayName: normalizeDisplayName(assistantName, personalityId),
        assistantContinuousListening: backgroundVoice !== 'false',
        autoSendAfterTranscribe: autoSend === 'true',
        defaultRagEnabled: defaultRag !== 'false',
        overlayEnabled: overlay === 'true',
        preferredModel: model,
        lastTranscript: transcript,
      });
    } catch {
      set({ hydrated: true });
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
    const trimmed = name.trim().slice(0, ASSISTANT_NAME_MAX_LENGTH);
    const value = trimmed || getPersonalityPreset(get().selectedPersonalityId).name;
    await setItemAsync(KEYS.assistantDisplayName, value);
    set({ assistantDisplayName: value });
  },

  setSelectedPersonalityId: async (id) => {
    const preset = getPersonalityPreset(id);
    await setItemAsync(KEYS.selectedPersonality, id);
    await setItemAsync(KEYS.assistantDisplayName, preset.name);
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

  setDefaultRag: async (v) => {
    await setItemAsync(KEYS.defaultRag, String(v));
    set({ defaultRagEnabled: v });
  },

  setOverlayEnabled: async (v) => {
    await setItemAsync(KEYS.overlayEnabled, String(v));
    set({ overlayEnabled: v });
  },

  setPreferredModel: async (model) => {
    await apiClient.updatePreferredModel(model);
    await setItemAsync(KEYS.preferredModel, model);
    set({ preferredModel: model });
  },

  loadPreferredModelFromApi: async () => {
    try {
      const data = await apiClient.getModels();
      const stored = get().preferredModel;
      set({ preferredModel: stored ?? data.primary });
    } catch {
      /* offline */
    }
  },

  setLastTranscript: async (text) => {
    if (text) {
      await setItemAsync(KEYS.lastTranscript, text);
    } else {
      await deleteItemAsync(KEYS.lastTranscript);
    }
    set({ lastTranscript: text });
  },
}));
