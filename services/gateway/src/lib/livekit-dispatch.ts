import { AgentDispatchClient } from 'livekit-server-sdk';
import { config } from '@ai-assistant/config';

function livekitHttpUrl(wsUrl: string): string {
  if (wsUrl.startsWith('wss://')) return wsUrl.replace('wss://', 'https://');
  if (wsUrl.startsWith('ws://')) return wsUrl.replace('ws://', 'http://');
  return wsUrl;
}

export async function dispatchVoiceAgent(roomName: string): Promise<void> {
  if (!config.livekitUrl || !config.livekitApiKey || !config.livekitApiSecret) {
    console.warn('[voice] LiveKit not configured — skipping agent dispatch for', roomName);
    return;
  }
  const host = livekitHttpUrl(config.livekitUrl);
  const client = new AgentDispatchClient(
    host,
    config.livekitApiKey,
    config.livekitApiSecret
  );
  try {
    const dispatch = await client.createDispatch(roomName, config.voiceGatewayAgentName);
    console.info('[voice] agent dispatch created', {
      roomName,
      agentName: config.voiceGatewayAgentName,
      dispatchId: dispatch.id,
    });
  } catch (err) {
    console.warn('[voice] agent dispatch failed (continuing anyway)', { roomName, err });
  }
}
