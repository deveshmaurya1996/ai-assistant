
export const WHATSAPP_STATUS_BROADCAST_JID = 'status@broadcast';
export const WHATSAPP_META_AI_JID = '13135550002@c.us';

export function shouldIgnoreWhatsAppJid(jid: string | undefined | null): boolean {
  if (!jid) return true;
  if (jid === WHATSAPP_STATUS_BROADCAST_JID) return true;
  if (jid === WHATSAPP_META_AI_JID) return true;
  if (jid.endsWith('@broadcast')) return true;
  if (jid.endsWith('@newsletter')) return true;
  return false;
}

export function isActionableWhatsAppJid(jid: string | undefined | null): boolean {
  return !shouldIgnoreWhatsAppJid(jid);
}
