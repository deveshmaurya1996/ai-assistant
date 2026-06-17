import { parseSseBuffer } from './sse.js';
import { voiceGatewayConfig } from './config.js';

export type TurnSseEvent = {
  event: string;
  data: string;
};

export async function* streamGatewayTurn(params: {
  userId: string;
  chatSessionId: string;
  text: string;
  voiceProfileId?: string;
  turnId?: string;
  roomId?: string;
  sttLatencyMs?: number;
  confirmed?: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<TurnSseEvent> {
  const url = `${voiceGatewayConfig.gatewayInternalUrl}/internal/voice/turn`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': voiceGatewayConfig.internalServiceToken,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      userId: params.userId,
      chatSessionId: params.chatSessionId,
      text: params.text,
      voiceProfileId: params.voiceProfileId,
      turnId: params.turnId,
      roomId: params.roomId,
      sttLatencyMs: params.sttLatencyMs,
      confirmed: params.confirmed ?? false,
    }),
    signal: params.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Gateway voice turn failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer(buffer);
    buffer = rest;
    for (const ev of events) {
      yield ev;
    }
  }

  if (buffer.trim()) {
    const { events } = parseSseBuffer(`${buffer}\n\n`);
    for (const ev of events) yield ev;
  }
}

export async function abortGatewayTurn(chatSessionId: string): Promise<void> {
  await fetch(`${voiceGatewayConfig.gatewayInternalUrl}/internal/voice/turn/abort`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': voiceGatewayConfig.internalServiceToken,
    },
    body: JSON.stringify({ chatSessionId }),
  }).catch(() => undefined);
}
