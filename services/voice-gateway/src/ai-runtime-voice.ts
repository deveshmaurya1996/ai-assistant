import { voiceGatewayConfig } from './config.js';

function intelligenceBaseUrl(): string {
  return voiceGatewayConfig.intelligenceUrl;
}

function internalHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${voiceGatewayConfig.internalServiceToken}`,
    'X-Internal-Service': 'voice-gateway',
  };
}

export async function transcribeViaAiRuntime(
  audio: Buffer,
  filename = 'audio.raw'
): Promise<string> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(audio)], { type: 'application/octet-stream' });
  form.append('file', blob, filename);

  const res = await fetch(`${intelligenceBaseUrl()}/v1/voice/transcribe`, {
    method: 'POST',
    headers: internalHeaders(),
    body: form,
  });

  if (!res.ok) {
    const details = await res.text().catch(() => '');
    throw new Error(`AI runtime STT failed (${res.status}) ${details}`.trim());
  }

  const json = (await res.json()) as { text?: string };
  return (json.text || '').trim();
}

export async function* synthesizePcmViaAiRuntime(
  text: string,
  voiceId: string,
  signal?: AbortSignal
): AsyncIterable<Buffer> {
  const url = `${intelligenceBaseUrl()}/v1/voice/speak`;
  let res: Response;

  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        ...internalHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice: voiceId,
        format: 'pcm_s16le',
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`AI runtime TTS unreachable at ${url}: ${reason}`);
  }

  if (!res.ok || !res.body) {
    const details = await res.text().catch(() => '');
    throw new Error(`AI runtime TTS failed (${res.status}) ${details}`.trim());
  }

  const reader = res.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) {
        yield Buffer.from(value);
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
}