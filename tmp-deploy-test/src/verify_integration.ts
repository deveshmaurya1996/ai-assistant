import { io as ClientSocket } from 'socket.io-client';
import { prisma } from '@ai-assistant/database';
import { config } from '@ai-assistant/config';

const API_BASE = `http://localhost:${config.apiPort}`;
const AI_BASE = config.aiServiceUrl.replace(/\/$/, '');
const TOOLRT_BASE = config.toolRuntimeUrl.replace(/\/$/, '');

const authHeaders = {
  'Content-Type': 'application/json',
  Origin: config.betterAuthUrl,
};

function parseCookies(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map((h) => h.split(';')[0])
    .join('; ');
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('Starting end-to-end integration test...');

  const testEmail = `testuser_${Date.now()}@example.com`;
  const testPassword = 'securepassword123';
  let cookieHeader = '';
  let sessionToken = '';
  let userId = '';
  let sessionId = '';

  console.log('\n1. Registering via Better Auth...');
  const signUpRes = await fetch(`${API_BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      name: 'Test Integration User',
    }),
  });

  if (!signUpRes.ok) {
    const err = await signUpRes.text();
    throw new Error(`Sign up failed: ${err}`);
  }

  const setCookies = signUpRes.headers.getSetCookie?.() ?? [];
  cookieHeader = parseCookies(setCookies);

  const sessionRes = await fetch(`${API_BASE}/api/auth/get-session`, {
    headers: { ...authHeaders, cookie: cookieHeader },
  });
  const sessionData = (await sessionRes.json()) as {
    session?: { token?: string };
    user?: { id: string };
  };
  sessionToken = sessionData.session?.token ?? '';
  userId = sessionData.user?.id ?? '';
  if (!userId || !sessionToken) {
    throw new Error('Failed to obtain session after sign up');
  }
  console.log(`User registered. User ID: ${userId}`);

  console.log('\n1.1 Verifying internal routes are protected...');
  const internalRes = await fetch(`${API_BASE}/internal/whatsapp/health`);
  if (internalRes.status !== 403) {
    throw new Error(`Expected 403 for internal route, got ${internalRes.status}`);
  }

  console.log('\n2. Ingesting documents into RAG...');
  const ingestRes = await fetch(`${AI_BASE}/v1/kb/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      documents: [
        {
          text: 'Project Antigravity is a high-speed orbital flight simulator.',
          metadata: { title: 'Project Antigravity Spec' },
        },
      ],
    }),
  });
  if (!ingestRes.ok) {
    throw new Error(`Ingest failed: ${await ingestRes.text()}`);
  }
  console.log('Documents ingested.');

  console.log('\n3. Creating chat session...');
  const chatSessionRes = await fetch(`${API_BASE}/chat/sessions`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      cookie: cookieHeader,
    },
    body: JSON.stringify({ title: 'Integration Test Chat' }),
  });
  if (!chatSessionRes.ok) {
    throw new Error(`Create session failed: ${await chatSessionRes.text()}`);
  }
  const chatSession = (await chatSessionRes.json()) as { id: string };
  sessionId = chatSession.id;
  console.log(`Chat session: ${sessionId}`);

  console.log('\n3.1 Creating ACTIVE google connection (test fixture)...');
  await prisma.userConnection.upsert({
    where: { id: `google_${userId}` },
    create: { id: `google_${userId}`, userId, providerId: 'google', status: 'ACTIVE', scopes: [] },
    update: { status: 'ACTIVE' },
  });

  console.log('\n3.2 Verifying tool catalog is user-scoped...');
  const toolsRes = await fetch(
    `${TOOLRT_BASE}/v1/tools/available?userId=${encodeURIComponent(userId)}`
  );
  if (!toolsRes.ok) throw new Error(`tools/available failed: ${await toolsRes.text()}`);
  const toolsData = (await toolsRes.json()) as { tools?: Array<{ function?: { name?: string } }> };
  const toolNames = (toolsData.tools ?? [])
    .map((t) => t.function?.name)
    .filter(Boolean) as string[];
  if (!toolNames.includes('gmail.read_inbox')) {
    throw new Error('Expected gmail.read_inbox to be available for ACTIVE google connection');
  }
  if (toolNames.includes('notes.create')) {
    throw new Error('notes.create should not be in the tool catalog');
  }

  console.log('\n4. WebSocket streaming...');
  await new Promise<void>((resolve, reject) => {
    const socket = ClientSocket(API_BASE, {
      auth: { token: sessionToken },
      extraHeaders: { cookie: cookieHeader },
    });

    socket.on('connect', () => {
      socket.emit('chat:message', {
        text: 'What is Project Antigravity?',
        chatSessionId: sessionId,
        ragEnabled: true,
      });
    });

    let accumulated = '';
    socket.on('chat:chunk', (data: { chunk: string }) => {
      process.stdout.write(data.chunk);
      accumulated += data.chunk;
    });

    socket.on('chat:end', async () => {
      console.log('\nStreaming complete.');
      socket.disconnect();
      resolve();
    });

    socket.on('chat:error', (err: unknown) => {
      socket.disconnect();
      reject(new Error(`Socket error: ${JSON.stringify(err)}`));
    });

    setTimeout(() => reject(new Error('Socket timeout')), 60000);
  });

  await sleep(500);

  console.log('\n5. Verifying PostgreSQL persistence...');
  const dbMessages = await prisma.message.findMany({
    where: { chatSessionId: sessionId },
    orderBy: { createdAt: 'asc' },
  });

  if (dbMessages.length < 2) {
    throw new Error('Expected USER and ASSISTANT messages in database');
  }

  console.log('\n6. Cross-user isolation check (cannot execute using other user connectionId)...');
  const otherEmail = `testuser2_${Date.now()}@example.com`;
  const signUpRes2 = await fetch(`${API_BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      email: otherEmail,
      password: testPassword,
      name: 'Test Integration User 2',
    }),
  });
  if (!signUpRes2.ok) throw new Error(`Second sign up failed: ${await signUpRes2.text()}`);
  const sessionRes2 = await fetch(`${API_BASE}/api/auth/get-session`, {
    headers: { ...authHeaders, cookie: parseCookies(signUpRes2.headers.getSetCookie?.() ?? []) },
  });
  const sessionData2 = (await sessionRes2.json()) as { user?: { id: string } };
  const userId2 = sessionData2.user?.id ?? '';
  if (!userId2) throw new Error('Failed to obtain second user');
  const otherConn = await prisma.userConnection.upsert({
    where: { id: `google_${userId2}` },
    create: { id: `google_${userId2}`, userId: userId2, providerId: 'google', status: 'ACTIVE', scopes: [] },
    update: { status: 'ACTIVE' },
  });

  const execRes = await fetch(`${TOOLRT_BASE}/v1/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      tool: 'gmail.read_inbox',
      args: { maxResults: 1 },
      source: 'manual',
      confirmed: true,
      connectionId: otherConn.id,
      preview: true,
    }),
  });
  if (execRes.ok) {
    throw new Error('Expected internal tools to reject other user connectionId');
  }

  console.log('\nEnd-to-end integration test SUCCEEDED.');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Integration test failed:', err.message);
  process.exit(1);
});
