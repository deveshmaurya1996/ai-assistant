import { config } from '@ai-assistant/config';

export const voiceGatewayConfig = {
  livekitUrl: config.livekitUrl ?? 'ws://localhost:7880',
  livekitApiKey: config.livekitApiKey ?? '',
  livekitApiSecret: config.livekitApiSecret ?? '',
  gatewayInternalUrl: (
    process.env.GATEWAY_INTERNAL_URL?.trim() ||
    process.env.API_PUBLIC_URL?.trim() ||
    `http://localhost:${config.apiPort}`
  ).replace(/\/$/, ''),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-token',
  agentName: config.voiceGatewayAgentName,
  intelligenceUrl: config.intelligenceUpstreamUrl,
  redisUrl: config.redisUrl,
};
