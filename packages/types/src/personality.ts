import type { VoiceProfile, VoiceResponseStyle } from './voice';
import { VOICE_STT_PROVIDER, VOICE_TTS_PROVIDER, DEFAULT_PIPER_VOICE } from './voice-providers';

export type PersonalityGender = 'female' | 'male' | 'neutral';

export interface AssistantPersonality {
  id: string;
  name: string;
  gender: PersonalityGender;
  tagline: string;
  voice: string;
  sttProvider: string;
  ttsProvider: string;
  responseStyle: VoiceResponseStyle;
  speakingRate: number;
  maxSentences: number;
  systemPrompt: string;
}

export interface AssistantContext {
  personalityId: string;
  displayName: string;
  systemPrompt: string;
  voice: string;
}

export interface PersonalitiesResponse {
  personalities: AssistantPersonality[];
}

export const ASSISTANT_NAME_MAX_LENGTH = 24;

export const ASSISTANT_PERSONALITIES: AssistantPersonality[] = [
  {
    id: 'assistant',
    name: 'Assistant',
    gender: 'neutral',
    tagline: 'Helpful and balanced',
    voice: 'female-professional',
    sttProvider: VOICE_STT_PROVIDER,
    ttsProvider: VOICE_TTS_PROVIDER,
    responseStyle: 'concise',
    speakingRate: 1,
    maxSentences: 3,
    systemPrompt:
      'You are {name}, a helpful and balanced AI assistant. Give clear, accurate answers in a neutral professional tone.',
  },
  {
    id: 'friday',
    name: 'Friday',
    gender: 'female',
    tagline: 'Friendly, professional',
    voice: 'female-friendly',
    sttProvider: VOICE_STT_PROVIDER,
    ttsProvider: VOICE_TTS_PROVIDER,
    responseStyle: 'concise',
    speakingRate: 1.05,
    maxSentences: 3,
    systemPrompt:
      'You are {name}, a friendly and professional AI assistant. Be warm and approachable while staying efficient.',
  },
  {
    id: 'jarvis',
    name: 'Jarvis',
    gender: 'male',
    tagline: 'Concise, crisp',
    voice: 'male-executive',
    sttProvider: VOICE_STT_PROVIDER,
    ttsProvider: VOICE_TTS_PROVIDER,
    responseStyle: 'concise',
    speakingRate: 1,
    maxSentences: 3,
    systemPrompt:
      'You are {name}, a concise AI assistant. Be direct and crisp. Avoid filler words and prefer short sentences unless detail is required.',
  },
  {
    id: 'nova',
    name: 'Nova',
    gender: 'female',
    tagline: 'Warm, upbeat',
    voice: 'teacher-calm',
    sttProvider: VOICE_STT_PROVIDER,
    ttsProvider: VOICE_TTS_PROVIDER,
    responseStyle: 'coaching',
    speakingRate: 1,
    maxSentences: 3,
    systemPrompt:
      'You are {name}, a warm and upbeat AI assistant. Be encouraging and positive without being excessive.',
  },
  {
    id: 'ghost',
    name: 'Ghost',
    gender: 'neutral',
    tagline: 'Calm, minimal',
    voice: 'friendly-neutral',
    sttProvider: VOICE_STT_PROVIDER,
    ttsProvider: VOICE_TTS_PROVIDER,
    responseStyle: 'coaching',
    speakingRate: 0.95,
    maxSentences: 4,
    systemPrompt:
      'You are {name}, a calm and minimal AI assistant. Be brief and serene. Use simple language and avoid unnecessary elaboration.',
  },
];

export const DEFAULT_ASSISTANT_PERSONALITY_ID = ASSISTANT_PERSONALITIES[0]!.id;

export const VOICE_DEFAULT_PROFILE_ID = DEFAULT_ASSISTANT_PERSONALITY_ID;

const LEGACY_PROFILE_TO_PERSONALITY: Record<string, string> = {
  'friendly-default': 'assistant',
  'executive-female': 'friday',
  'executive-male': 'jarvis',
  teacher: 'ghost',
  coach: 'nova',
};

export function personalityToVoiceProfile(personality: AssistantPersonality): VoiceProfile {
  return {
    id: personality.id,
    label: personality.name,
    sttProvider: personality.sttProvider,
    ttsProvider: personality.ttsProvider,
    voiceId: personality.voice,
    personalityId: personality.id,
    responseStyle: personality.responseStyle,
    speakingRate: personality.speakingRate,
    maxSentences: personality.maxSentences,
  };
}

export const VOICE_PROFILES: VoiceProfile[] = ASSISTANT_PERSONALITIES.map(personalityToVoiceProfile);

export function getAssistantPersonality(id: string): AssistantPersonality {
  return ASSISTANT_PERSONALITIES.find((p) => p.id === id) ?? ASSISTANT_PERSONALITIES[0]!;
}

export function normalizePersonalityId(id: string | undefined | null): string {
  if (id && ASSISTANT_PERSONALITIES.some((p) => p.id === id)) {
    return id;
  }
  return ASSISTANT_PERSONALITIES[0]!.id;
}

export function normalizeVoiceProfileId(id: string | undefined | null): string {
  if (!id?.trim()) return DEFAULT_ASSISTANT_PERSONALITY_ID;
  const trimmed = id.trim();
  return LEGACY_PROFILE_TO_PERSONALITY[trimmed] ?? normalizePersonalityId(trimmed);
}

export function getVoiceProfileForPersonality(
  personalityId: string | undefined | null
): VoiceProfile {
  return personalityToVoiceProfile(getAssistantPersonality(normalizePersonalityId(personalityId)));
}

export function getVoiceProfile(id: string | undefined | null): VoiceProfile | undefined {
  const personalityId = normalizeVoiceProfileId(id);
  if (!ASSISTANT_PERSONALITIES.some((p) => p.id === personalityId)) {
    return undefined;
  }
  return getVoiceProfileForPersonality(personalityId);
}

export function resolvePersonalityVoiceId(
  personality: AssistantPersonality,
  env: Record<string, string | undefined> = {}
): string {
  const envKey = `PIPER_VOICE_${personality.voice.toUpperCase().replace(/-/g, '_')}`;
  return (
    env[envKey]?.trim() ||
    env.PIPER_DEFAULT_VOICE?.trim() ||
    DEFAULT_PIPER_VOICE
  );
}

export function listVoiceProfilesPublic(): Array<
  Pick<VoiceProfile, 'id' | 'label' | 'responseStyle' | 'speakingRate'>
> {
  return VOICE_PROFILES.map(({ id, label, responseStyle, speakingRate }) => ({
    id,
    label,
    responseStyle,
    speakingRate,
  }));
}

export function formatPersonalityGender(gender: PersonalityGender): string {
  switch (gender) {
    case 'female':
      return 'Female';
    case 'male':
      return 'Male';
    default:
      return 'Neutral';
  }
}

export function canCustomizeAssistantDisplayName(personalityId: string): boolean {
  return normalizePersonalityId(personalityId) === DEFAULT_ASSISTANT_PERSONALITY_ID;
}

export function reconcileDisplayName(
  personalityId: string,
  displayName?: string | null
): string {
  const personality = getAssistantPersonality(normalizePersonalityId(personalityId));

  if (!canCustomizeAssistantDisplayName(personality.id)) {
    return personality.name;
  }

  const trimmed = displayName?.trim().slice(0, ASSISTANT_NAME_MAX_LENGTH) ?? '';
  if (!trimmed) return personality.name;

  const lower = trimmed.toLowerCase();
  if (lower === personality.name.toLowerCase()) return trimmed;

  const matchesOtherPreset = ASSISTANT_PERSONALITIES.some(
    (p) => p.id !== personality.id && p.name.toLowerCase() === lower
  );
  if (matchesOtherPreset) return personality.name;

  return trimmed;
}

export function buildAssistantIdentityBlock(
  displayName: string,
  personalityId: string
): string {
  return [
    `Assistant identity (authoritative): Your name is ${displayName}.`,
    `Active personality preset: ${personalityId}.`,
    'When asked who you are, your name, or to introduce yourself, answer using this identity only.',
    'Never say you have no name, no personal identity, or that you are only a generic AI.',
    'Never use a different name (including names from past chats or retrieved context).',
  ].join(' ');
}

export function resolveAssistantContext(
  personalityId: string,
  displayName?: string
): AssistantContext {
  const personality = getAssistantPersonality(normalizePersonalityId(personalityId));
  const name = reconcileDisplayName(personality.id, displayName);
  const basePrompt = personality.systemPrompt.replaceAll('{name}', name);
  const systemPrompt = [
    basePrompt,
    `Tone: ${personality.tagline}. Stay in character for both short and long replies.`,
    buildAssistantIdentityBlock(name, personality.id),
    'Platform capabilities: You can set reminders and scheduled notifications for the user from natural language. ' +
      'Supported connected apps: Google Workspace (Gmail, Calendar, Drive), WhatsApp, and Files. ' +
      'If the user asks about an unsupported app, say we are working on adding it and mention supported apps. ' +
      'If an app is not connected or offline, direct them to Connect Apps in the app — do not attempt to access it. ' +
      'When Gmail or WhatsApp are connected and tool results include inbox data, summarize important items. ' +
      'When tool results confirm a reminder was scheduled or inbox data was fetched, use that data in your reply — ' +
      'never say you cannot set reminders or access inbox unless a tool result explicitly failed.',
  ].join('\n');
  return {
    personalityId: personality.id,
    displayName: name,
    systemPrompt,
    voice: resolvePersonalityVoiceId(personality),
  };
}
