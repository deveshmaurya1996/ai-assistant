import { cli, ServerOptions } from '@livekit/agents';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { voiceGatewayConfig } from './config.js';

const agentPath = join(dirname(fileURLToPath(import.meta.url)), 'agent.js');

console.info('[voice-gateway] starting worker', {
  livekitUrl: voiceGatewayConfig.livekitUrl,
  gateway: voiceGatewayConfig.gatewayInternalUrl,
  intelligence: voiceGatewayConfig.intelligenceUrl,
  agentName: voiceGatewayConfig.agentName,
});

void (async () => {
  const url = voiceGatewayConfig.intelligenceUrl;
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      console.warn(`[voice-gateway] AI runtime unhealthy at ${url} (HTTP ${res.status})`);
    }
  } catch {
    console.error(
      `[voice-gateway] Cannot reach AI runtime at ${url} — welcome TTS will fail. ` +
        'Set INTELLIGENCE_UPSTREAM_URL=http://localhost:8000 and run pnpm dev:ai-runtime'
    );
  }
})();

if (!voiceGatewayConfig.livekitApiKey) {
  console.warn('[voice-gateway] LIVEKIT_API_KEY not set — worker may fail to connect');
}

cli.runApp(
  new ServerOptions({
    agent: agentPath,
    agentName: voiceGatewayConfig.agentName,
    wsURL: voiceGatewayConfig.livekitUrl,
    apiKey: voiceGatewayConfig.livekitApiKey,
    apiSecret: voiceGatewayConfig.livekitApiSecret,
  })
);

export { processVoiceTranscript } from './voice-turn-processor.js';
