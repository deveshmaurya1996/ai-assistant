import { loadMonorepoEnv } from './load-env';

loadMonorepoEnv();

function envOptional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

const nodeEnv = envOptional('NODE_ENV', 'development');

const defaultTextModel = envOptional(
  'PRIMARY_MODEL',
  'gemini/gemini-3.1-pro-preview'
);
const defaultTextFallback = envOptional('FALLBACK_MODEL', 'pollinations/openai');

export interface AppConfig {
  nodeEnv: string;
  isDev: boolean;
  apiPort: number;
  aiServiceUrl: string;
  databaseUrl: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  redisUrl: string;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  logQueries: boolean;
  primaryModel: string;
  fallbackModel: string;
  textModel: string;
  textFallbackModel: string;
  transcriptionModel: string;
  transcriptionFallbackModel: string;
  speechModel: string;
  speechFallbackModel: string;
  imageModel: string;
  imageFallbackModel: string;
  qdrantUrl: string;
  geminiApiKey: string | undefined;
  openaiApiKey: string | undefined;
  anthropicApiKey: string | undefined;
  pollinationsApiKey: string | undefined;
  toolRuntimeUrl: string;
  aiOrchestratorUrl: string;
  ingestionEngineUrl: string;
  whatsappBridgeUrl: string;
  integrationEncryptionKey: string;
}

export const config: AppConfig = {
  nodeEnv,
  isDev: nodeEnv !== 'production',
  apiPort: envInt('API_PORT', 3000),
  aiServiceUrl: envOptional('AI_SERVICE_URL', 'http://localhost:8000'),
  databaseUrl: envOptional(
    'DATABASE_URL',
    'postgresql://ai_assistant:ai_assistant@localhost:5432/ai_assistant'
  ),
  betterAuthSecret: envOptional('BETTER_AUTH_SECRET', 'dev-secret-change-in-production'),
  betterAuthUrl: envOptional('BETTER_AUTH_URL', 'http://localhost:3000'),
  redisUrl: envOptional('REDIS_URL', 'redis://localhost:6379'),
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  logQueries: process.env.PRISMA_LOG_QUERIES === 'true',
  primaryModel: defaultTextModel,
  fallbackModel: defaultTextFallback,
  textModel: envOptional('TEXT_MODEL', defaultTextModel),
  textFallbackModel: envOptional('TEXT_FALLBACK_MODEL', defaultTextFallback),
  transcriptionModel: envOptional('TRANSCRIPTION_MODEL', 'whisper-1'),
  transcriptionFallbackModel: envOptional(
    'TRANSCRIPTION_FALLBACK_MODEL',
    'pollinations/openai'
  ),
  speechModel: envOptional('SPEECH_MODEL', 'tts-1'),
  speechFallbackModel: envOptional('SPEECH_FALLBACK_MODEL', 'pollinations/openai-audio'),
  imageModel: envOptional('IMAGE_MODEL', 'pollinations/flux'),
  imageFallbackModel: envOptional('IMAGE_FALLBACK_MODEL', 'dall-e-3'),
  qdrantUrl: envOptional('QDRANT_URL', 'http://localhost:6333'),
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pollinationsApiKey: process.env.POLLINATIONS_API_KEY,
  toolRuntimeUrl: envOptional('TOOL_RUNTIME_URL', 'http://localhost:3011'),
  aiOrchestratorUrl: envOptional('AI_ORCHESTRATOR_URL', 'http://localhost:3013'),
  ingestionEngineUrl: envOptional('INGESTION_ENGINE_URL', 'http://localhost:3012'),
  whatsappBridgeUrl: envOptional(
    'WHATSAPP_BRIDGE_URL',
    `http://localhost:${envInt('API_PORT', 3000)}/internal/whatsapp`
  ),
  integrationEncryptionKey: envOptional(
    'INTEGRATION_ENCRYPTION_KEY',
    'dev-integration-key-change-me'
  ),
};

export function getAiServiceUrl(path: string): string {
  const base = config.aiServiceUrl.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function getAiChatStreamUrl(): string {
  return getAiServiceUrl('/v1/chat/stream');
}
