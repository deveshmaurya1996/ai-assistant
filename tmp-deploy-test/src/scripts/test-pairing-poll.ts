/**
 * Simulates mobile polling while pairing. Usage:
 *   WHATSAPP_LOG_LEVEL=info node -r @ai-assistant/config/register dist/scripts/test-pairing-poll.js 9670551347
 */
import { sessionManager } from '../whatsapp/session-manager';

const phone = process.argv[2] ?? '9670551347';
const userId = process.env.TEST_USER_ID ?? 'pairing-poll-test';

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollLikeMobile(sessionId: string): Promise<void> {
  const snap = await sessionManager.getLinkingSessionState(sessionId);
  const phase = sessionManager.getConnectionPhase(sessionId);
  const reconnecting = sessionManager.isReconnecting(sessionId);
  console.log(
    `[poll] status=${snap.status} phase=${phase ?? 'n/a'} reconnecting=${reconnecting} ` +
      `accepted=${!!snap.pairingAccepted} code=${snap.pairingCode ?? '—'}`
  );
  return snap.status === 'active' ? undefined : Promise.resolve();
}

async function main(): Promise<void> {
  const session = await sessionManager.createSession(userId, 'poll-test');
  const sessionId = session.sessionId;
  console.log(`Session ${sessionId}`);

  const pollTimer = setInterval(() => {
    void pollLikeMobile(sessionId).then((done) => {
      if (sessionManager.getSession(sessionId)?.status === 'active') {
        clearInterval(pollTimer);
      }
    });
  }, 1000);

  const updated = await sessionManager.requestPairingCode(sessionId, phone, {
    countryCode: '91',
    forceRefresh: true,
  });

  console.log('\nEnter in WhatsApp → Link with phone number');
  console.log(`Phone: ${updated.pairingPhone}`);
  console.log(`Code:  ${updated.pairingCode}\n`);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(2000);
    const current = sessionManager.getSession(sessionId);
    if (current?.status === 'active') {
      clearInterval(pollTimer);
      console.log('SUCCESS: active');
      process.exit(0);
    }
  }

  clearInterval(pollTimer);
  console.error('TIMEOUT');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
