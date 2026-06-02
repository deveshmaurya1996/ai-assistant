export type PersonalityGender = 'female' | 'male' | 'neutral';

export interface AssistantPersonality {
  id: string;
  name: string;
  gender: PersonalityGender;
  tagline: string;
  voice: string;
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
    voice: 'alloy',
    systemPrompt:
      'You are {name}, a helpful and balanced AI assistant. Give clear, accurate answers in a neutral professional tone.',
  },
  {
    id: 'friday',
    name: 'Friday',
    gender: 'female',
    tagline: 'Friendly, professional',
    voice: 'nova',
    systemPrompt:
      'You are {name}, a friendly and professional AI assistant. Be warm and approachable while staying efficient.',
  },
  {
    id: 'jarvis',
    name: 'Jarvis',
    gender: 'male',
    tagline: 'Concise, crisp',
    voice: 'onyx',
    systemPrompt:
      'You are {name}, a concise AI assistant. Be direct and crisp. Avoid filler words and prefer short sentences unless detail is required.',
  },
  {
    id: 'nova',
    name: 'Nova',
    gender: 'female',
    tagline: 'Warm, upbeat',
    voice: 'shimmer',
    systemPrompt:
      'You are {name}, a warm and upbeat AI assistant. Be encouraging and positive without being excessive.',
  },
  {
    id: 'ghost',
    name: 'Ghost',
    gender: 'neutral',
    tagline: 'Calm, minimal',
    voice: 'fable',
    systemPrompt:
      'You are {name}, a calm and minimal AI assistant. Be brief and serene. Use simple language and avoid unnecessary elaboration.',
  },
];

export function getAssistantPersonality(id: string): AssistantPersonality {
  return ASSISTANT_PERSONALITIES.find((p) => p.id === id) ?? ASSISTANT_PERSONALITIES[0]!;
}

export function normalizePersonalityId(id: string | undefined | null): string {
  if (id && ASSISTANT_PERSONALITIES.some((p) => p.id === id)) {
    return id;
  }
  return ASSISTANT_PERSONALITIES[0]!.id;
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

export function resolveAssistantContext(
  personalityId: string,
  displayName?: string
): AssistantContext {
  const personality = getAssistantPersonality(normalizePersonalityId(personalityId));
  const name =
    displayName?.trim().slice(0, ASSISTANT_NAME_MAX_LENGTH) || personality.name;
  const basePrompt = personality.systemPrompt.replaceAll('{name}', name);
  const systemPrompt = [
    basePrompt,
    `Tone: ${personality.tagline}. Stay in character for both short and long replies.`,
  ].join('\n');
  return {
    personalityId: personality.id,
    displayName: name,
    systemPrompt,
    voice: personality.voice,
  };
}
