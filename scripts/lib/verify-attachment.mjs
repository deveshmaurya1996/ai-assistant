
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { io } from 'socket.io-client';

export function apiBase() {
  const port = Number(process.env.API_PORT || process.env.GATEWAY_PORT || 3000);
  return (
    process.env.API_PUBLIC_URL ||
    process.env.GATEWAY_URL ||
    process.env.API_URL ||
    `http://localhost:${port}`
  ).replace(/\/$/, '');
}

export function authOrigin() {
  return (
    process.env.API_PUBLIC_URL ||
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    apiBase()
  );
}

function parseCookies(setCookieHeaders) {
  return setCookieHeaders.map((h) => h.split(';')[0]).join('; ');
}

export async function signUpSession() {
  const base = apiBase();
  const headers = { 'Content-Type': 'application/json', Origin: authOrigin() };
  const email = `attach_${Date.now()}@example.com`;

  const signUpRes = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password: 'securepassword123',
      name: 'Attachment Verify',
    }),
  });
  if (!signUpRes.ok) {
    throw new Error(`Sign up failed: ${await signUpRes.text()}`);
  }

  const cookie = parseCookies(signUpRes.headers.getSetCookie?.() ?? []);
  const sessionRes = await fetch(`${base}/api/auth/get-session`, {
    headers: { ...headers, cookie },
  });
  const sessionData = await sessionRes.json();
  const sessionToken = sessionData.session?.token;
  if (!sessionToken) throw new Error('No session token after sign up');

  return { base, cookie, sessionToken, email };
}

export async function uploadFile({ sessionToken, cookie, buffer, filename, mimeType }) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  const uploadRes = await fetch(`${apiBase()}/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken}`, cookie },
    body: form,
  });
  if (!uploadRes.ok) {
    throw new Error(`Upload failed ${uploadRes.status}: ${await uploadRes.text()}`);
  }
  const uploaded = await uploadRes.json();
  return {
    id: uploaded.id,
    filename: uploaded.filename,
    mimeType: uploaded.mimeType,
    kind: uploaded.kind ?? (uploaded.mimeType?.startsWith('image/') ? 'image' : 'file'),
    sizeBytes: uploaded.sizeBytes,
  };
}

export function loadAttachmentFromPath(filePath) {
  const buffer = readFileSync(filePath);
  const filename = basename(filePath);
  const lower = filename.toLowerCase();
  const mimeType = lower.endsWith('.png')
    ? 'image/png'
    : lower.endsWith('.webp')
      ? 'image/webp'
      : lower.endsWith('.gif')
        ? 'image/gif'
        : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
          ? 'image/jpeg'
          : 'application/octet-stream';
  return { buffer, filename, mimeType };
}

export function chatWithAttachment(opts) {
  const { sessionToken, cookie, attachment, prompt, validate, timeoutMs = 120_000 } = opts;
  const base = apiBase();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket timeout')), timeoutMs);
    let chunks = '';

    const socket = io(base, {
      transports: ['websocket'],
      auth: { token: sessionToken },
      extraHeaders: { cookie },
    });

    socket.on('connect', () => {
      socket.emit('chat:message', {
        text: prompt,
        attachments: [attachment],
        ragEnabled: false,
      });
    });

    socket.on('chat:chunk', (data) => {
      chunks += data.chunk ?? '';
    });

    socket.on('chat:error', (err) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(new Error(`chat:error ${JSON.stringify(err)}`));
    });

    socket.on('chat:end', (data) => {
      clearTimeout(timeout);
      const reply = (data.message?.content ?? chunks).trim();
      socket.disconnect();
      try {
        validate(reply, { modelUsed: data.modelUsed, modelLabel: data.modelLabel });
        resolve({ reply, modelUsed: data.modelUsed, modelLabel: data.modelLabel });
      } catch (err) {
        reject(err);
      }
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
