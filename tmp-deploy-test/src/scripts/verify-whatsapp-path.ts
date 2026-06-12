
import { getWhatsAppAuthRoot } from '../whatsapp/auth-paths';
import { findLatestActiveBridgeSession } from '../whatsapp/session-resolve';

const userId = process.argv[2] ?? 'F9OdgkVwBXNLlPsy2ccmZxzbOwAXPYAi';

async function main() {
  const authRoot = getWhatsAppAuthRoot();
  console.log('[verify-whatsapp] auth root:', authRoot);

  const sessionId = await findLatestActiveBridgeSession(userId);
  if (!sessionId) {
    console.error('[verify-whatsapp] No active session on disk for user', userId);
    process.exit(1);
  }

  console.log('[verify-whatsapp] OK — active session:', sessionId);
}

main().catch((err) => {
  console.error('[verify-whatsapp] FAILED:', err);
  process.exit(1);
});
