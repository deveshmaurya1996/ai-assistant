export type IconSpec = {
  icon: string;
  color: string;
  fallback?: string;
  pickerBackground?: string;
};

function slug(modelId: string): string {
  const slash = modelId.lastIndexOf('/');
  return (slash >= 0 ? modelId.slice(slash + 1) : modelId).toLowerCase();
}

function provider(modelId: string): string {
  const slash = modelId.indexOf('/');
  return (slash >= 0 ? modelId.slice(0, slash) : modelId).toLowerCase();
}

const PROVIDER_ICONS: Record<string, IconSpec> = {
  nvidia: { icon: 'simple-icons:nvidia', color: '#76B900', fallback: 'chip' },
  groq: { icon: 'simple-icons:groq', color: '#F55036', fallback: 'lightning-bolt' },
  google: { icon: 'simple-icons:googlegemini', color: '#4285F4', fallback: 'google' },
  pollinations: { icon: 'lobehub:pollinations', color: '#F59E0B', fallback: 'flower' },
  microsoft: { icon: 'simple-icons:microsoft', color: '#00A4EF', fallback: 'microsoft' },
};

const MODEL_ICONS: Record<string, IconSpec> = {
  qwen: { icon: 'lobehub:qwen-color', color: '#615EFF', fallback: 'message-star-outline' },
  glm: { icon: 'token-branded:glm', color: '#1C408A', fallback: 'chat-processing-outline' },
  kimi: { icon: 'hugeicons:kimi-ai', color: '#1783FF', fallback: 'moon-waning-crescent' },
  mistral: { icon: 'lobehub:mistral-color', color: '#FA5200', fallback: 'weather-windy' },
  nemotron: { icon: 'simple-icons:nvidia', color: '#76B900', fallback: 'chip' },
};

export function resolveModelIcon(modelId: string): IconSpec {
  const s = slug(modelId);
  const p = provider(modelId);

  if (p === 'pollinations' && !s.includes('flux') && !s.includes('whisper')) {
    return PROVIDER_ICONS.pollinations;
  }

  if (s.includes('deepseek')) {
    return { icon: 'simple-icons:deepseek', color: '#0EA5E9', fallback: 'waves' };
  }
  if (s.includes('glm')) {
    return MODEL_ICONS.glm;
  }
  if (s.includes('qwen')) {
    return MODEL_ICONS.qwen;
  }
  if (s.includes('kimi')) {
    return MODEL_ICONS.kimi;
  }
  if (s.includes('nemotron') && !s.includes('mistral')) {
    return MODEL_ICONS.nemotron;
  }
  if (s.includes('mistral')) {
    return MODEL_ICONS.mistral;
  }
  if (s.includes('llama')) {
    return { icon: 'simple-icons:meta', color: '#0668E1', fallback: 'horse-variant' };
  }
  if (s.includes('phi')) {
    return PROVIDER_ICONS.microsoft;
  }
  if (s.includes('gemma') || s.includes('paligemma')) {
    return { icon: 'simple-icons:googlegemini', color: '#4285F4', fallback: 'google' };
  }
  if (s.includes('gpt') || s.includes('oss')) {
    return { icon: 'simple-icons:openai', color: '#10A37F', fallback: 'robot-outline' };
  }
  if (s.includes('magpie')) {
    return { icon: 'mdi:microphone', color: '#76B900', fallback: 'microphone' };
  }
  if (s.includes('flux')) {
    return { icon: 'mdi:image-filter-hdr', color: '#A855F7', fallback: 'image-filter-hdr' };
  }
  if (s.includes('whisper')) {
    return { icon: 'mdi:ear-hearing', color: '#6366F1', fallback: 'ear-hearing' };
  }

  return (
    PROVIDER_ICONS[p] ?? {
      icon: 'simple-icons:huggingface',
      color: '#FFD21E',
      fallback: 'brain',
    }
  );
}

export function autoRoutingIcon(): IconSpec {
  return {
    icon: 'simple-icons:openrouter',
    color: '#6366F1',
    fallback: 'star-four-points-outline',
  };
}

const PERSONALITY_ICONS: Record<string, IconSpec> = {
  assistant: { icon: 'mdi:face-agent', color: '#8B5CF6', fallback: 'face-agent' },
  friday: { icon: 'mdi:account-tie-woman', color: '#EC4899', fallback: 'account-tie-woman' },
  jarvis: { icon: 'mdi:account-tie', color: '#3B82F6', fallback: 'account-tie' },
  nova: { icon: 'mdi:star-shooting', color: '#F59E0B', fallback: 'star-shooting' },
  ghost: { icon: 'mdi:ghost', color: '#94A3B8', fallback: 'ghost' },
};

const GENDER_FALLBACK: Record<string, IconSpec> = {
  female: { icon: 'mdi:face-woman', color: '#EC4899', fallback: 'face-woman' },
  male: { icon: 'mdi:face-man', color: '#3B82F6', fallback: 'face-man' },
  neutral: { icon: 'mdi:face-man-profile', color: '#8B5CF6', fallback: 'face-man-profile' },
};

export function resolvePersonalityIcon(
  personalityId: string,
  gender?: string
): IconSpec {
  return (
    PERSONALITY_ICONS[personalityId] ??
    GENDER_FALLBACK[gender ?? 'neutral'] ??
    PERSONALITY_ICONS.assistant!
  );
}

const INTEGRATION_PROVIDERS: Record<string, IconSpec> = {
  whatsapp: { icon: 'mdi:whatsapp', color: '#25D366', fallback: 'whatsapp' },
  google: { icon: 'logos:google-icon', color: '#4285F4', fallback: 'google' },
  notes: { icon: 'mdi:note-text', color: '#F59E0B', fallback: 'note-text' },
};

export function resolveProviderIcon(providerId: string): IconSpec {
  return (
    INTEGRATION_PROVIDERS[providerId] ?? {
      icon: 'mdi:puzzle-outline',
      color: '#64748B',
      fallback: 'puzzle-outline',
    }
  );
}
