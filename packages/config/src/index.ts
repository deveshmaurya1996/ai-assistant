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
  qdrantUrl: string;
  nvidiaApiKey: string | undefined;
  pollinationsApiKey: string | undefined;
  toolRuntimeUrl: string;
  skillRuntimeUrl: string;
  aiOrchestratorUrl: string;
  cognitiveRuntimeUrl: string;
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
  qdrantUrl: envOptional('QDRANT_URL', 'http://localhost:6333'),
  nvidiaApiKey: process.env.NVIDIA_API_KEY,
  pollinationsApiKey: process.env.POLLINATIONS_API_KEY,
  toolRuntimeUrl: envOptional('TOOL_RUNTIME_URL', 'http://localhost:3011'),
  skillRuntimeUrl: envOptional('SKILL_RUNTIME_URL', 'http://localhost:3014'),
  aiOrchestratorUrl: envOptional(
    'AI_ORCHESTRATOR_URL',
    envOptional('COGNITIVE_RUNTIME_URL', 'http://localhost:3013')
  ),
  cognitiveRuntimeUrl: envOptional(
    'COGNITIVE_RUNTIME_URL',
    envOptional('AI_ORCHESTRATOR_URL', 'http://localhost:3013')
  ),
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
