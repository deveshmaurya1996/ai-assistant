import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { ThemeMode } from '@/theme/tokens';
import { TERMS_VERSION } from '@/content/terms';
import { getModels, updatePreferredModel } from '@/lib/api';

const KEYS = {
  termsAccepted: 'terms_accepted_at',
  termsVersion: 'terms_version',
  backgroundVoice: 'background_voice_enabled',
  autoSendVoice: 'auto_send_voice',
  defaultRag: 'default_rag_enabled',
  overlayEnabled: 'overlay_enabled',
  preferredModel: 'preferred_model',
  lastTranscript: 'last_transcript',
} as const;

type SettingsState = {
  hydrated: boolean;
  termsAcceptedAt: string | null;
  backgroundVoiceEnabled: boolean;
  autoSendAfterTranscribe: boolean;
  defaultRagEnabled: boolean;
  overlayEnabled: boolean;
  preferredModel: string | null;
  lastTranscript: string | null;
  hydrate: () => Promise<void>;
  acceptTerms: () => Promise<void>;
  hasAcceptedTerms: () => boolean;
  setBackgroundVoice: (v: boolean) => Promise<void>;
  setAutoSend: (v: boolean) => Promise<void>;
  setDefaultRag: (v: boolean) => Promise<void>;
  setOverlayEnabled: (v: boolean) => Promise<void>;
  setPreferredModel: (model: string) => Promise<void>;
  loadPreferredModelFromApi: () => Promise<void>;
  setLastTranscript: (text: string | null) => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hydrated: false,
  termsAcceptedAt: null,
  backgroundVoiceEnabled: true,
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
        backgroundVoice,
        autoSend,
        defaultRag,
        overlay,
        model,
        transcript,
      ] = await Promise.all([
        SecureStore.getItemAsync(KEYS.termsAccepted),
        SecureStore.getItemAsync(KEYS.termsVersion),
        SecureStore.getItemAsync(KEYS.backgroundVoice),
        SecureStore.getItemAsync(KEYS.autoSendVoice),
        SecureStore.getItemAsync(KEYS.defaultRag),
        SecureStore.getItemAsync(KEYS.overlayEnabled),
        SecureStore.getItemAsync(KEYS.preferredModel),
        SecureStore.getItemAsync(KEYS.lastTranscript),
      ]);

      set({
        hydrated: true,
        termsAcceptedAt:
          termsVersion === TERMS_VERSION && termsAccepted ? termsAccepted : null,
        backgroundVoiceEnabled: backgroundVoice !== 'false',
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
    await SecureStore.setItemAsync(KEYS.termsAccepted, at);
    await SecureStore.setItemAsync(KEYS.termsVersion, TERMS_VERSION);
    set({ termsAcceptedAt: at });
  },

  hasAcceptedTerms: () => {
    const { termsAcceptedAt } = get();
    return Boolean(termsAcceptedAt);
  },

  setBackgroundVoice: async (v) => {
    await SecureStore.setItemAsync(KEYS.backgroundVoice, String(v));
    set({ backgroundVoiceEnabled: v });
  },

  setAutoSend: async (v) => {
    await SecureStore.setItemAsync(KEYS.autoSendVoice, String(v));
    set({ autoSendAfterTranscribe: v });
  },

  setDefaultRag: async (v) => {
    await SecureStore.setItemAsync(KEYS.defaultRag, String(v));
    set({ defaultRagEnabled: v });
  },

  setOverlayEnabled: async (v) => {
    await SecureStore.setItemAsync(KEYS.overlayEnabled, String(v));
    set({ overlayEnabled: v });
  },

  setPreferredModel: async (model) => {
    await updatePreferredModel(model);
    await SecureStore.setItemAsync(KEYS.preferredModel, model);
    set({ preferredModel: model });
  },

  loadPreferredModelFromApi: async () => {
    try {
      const data = await getModels();
      const stored = get().preferredModel;
      set({ preferredModel: stored ?? data.primary });
    } catch {
      /* offline */
    }
  },

  setLastTranscript: async (text) => {
    if (text) {
      await SecureStore.setItemAsync(KEYS.lastTranscript, text);
    } else {
      await SecureStore.deleteItemAsync(KEYS.lastTranscript);
    }
    set({ lastTranscript: text });
  },
}));
