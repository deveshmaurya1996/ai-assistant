export function isLidJid(jid: string): boolean {
  return jid.endsWith('@lid');
}

export function isPlaceholderDisplayName(name: string | undefined, jid: string): boolean {
  const trimmed = name?.trim();
  if (!trimmed) return true;
  const user = jid.split('@')[0]?.split(':')[0] ?? '';
  if (user && trimmed === user) return true;
  if (/^\d{5,}$/.test(trimmed) && isLidJid(jid)) return true;
  return false;
}

export type BaileysContactLike = {
  id?: string;
  jid?: string;
  lid?: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
};

export function pickBaileysContactName(contact: BaileysContactLike): string | undefined {
  for (const candidate of [contact.name, contact.notify, contact.verifiedName]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export type LidContactIndex = {
  contactNames: Map<string, string>;
  lidToPn: Map<string, string>;
};

export function createLidContactIndex(): LidContactIndex {
  return { contactNames: new Map(), lidToPn: new Map() };
}

function storeContactName(index: LidContactIndex, jid: string | undefined, name: string): void {
  if (!jid || isPlaceholderDisplayName(name, jid)) return;
  const prev = index.contactNames.get(jid);
  if (!prev || isPlaceholderDisplayName(prev, jid)) {
    index.contactNames.set(jid, name);
  }
}

export function ingestBaileysContact(
  index: LidContactIndex,
  contact: BaileysContactLike
): string | undefined {
  const name = pickBaileysContactName(contact);
  const id = contact.id?.trim();
  const pnJid =
    contact.jid?.trim() ??
    (id && !isLidJid(id) && id.includes('@') ? id : undefined);
  const lidJid =
    contact.lid?.trim() ?? (id && isLidJid(id) ? id : undefined);

  if (lidJid && pnJid) {
    index.lidToPn.set(lidJid, pnJid);
  }

  if (name) {
    if (id) storeContactName(index, id, name);
    if (pnJid) storeContactName(index, pnJid, name);
    if (lidJid) storeContactName(index, lidJid, name);
  }

  return name;
}

type MessageKeyLike = {
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  participant?: string | null;
  participantAlt?: string | null;
};

export function ingestMessageJidMapping(index: LidContactIndex, key: MessageKeyLike | undefined): void {
  if (!key) return;
  if (key.remoteJid && key.remoteJidAlt) {
    if (isLidJid(key.remoteJid) && !isLidJid(key.remoteJidAlt)) {
      index.lidToPn.set(key.remoteJid, key.remoteJidAlt);
    } else if (isLidJid(key.remoteJidAlt) && !isLidJid(key.remoteJid)) {
      index.lidToPn.set(key.remoteJidAlt, key.remoteJid);
    }
  }
  if (key.participant && key.participantAlt) {
    if (isLidJid(key.participant) && !isLidJid(key.participantAlt)) {
      index.lidToPn.set(key.participant, key.participantAlt);
    } else if (isLidJid(key.participantAlt) && !isLidJid(key.participant)) {
      index.lidToPn.set(key.participantAlt, key.participant);
    }
  }
}

export type ResolveDisplayNameInput = {
  chatName?: string;
  pushName?: string;
  chatNamesByJid?: Map<string, string>;
};

export function resolveWhatsAppDisplayName(
  jid: string,
  index: LidContactIndex,
  input: ResolveDisplayNameInput = {}
): string {
  const { chatName, pushName, chatNamesByJid } = input;

  if (chatName && !isPlaceholderDisplayName(chatName, jid)) {
    return chatName.trim();
  }

  const indexed = index.contactNames.get(jid);
  if (indexed && !isPlaceholderDisplayName(indexed, jid)) {
    return indexed;
  }

  if (isLidJid(jid)) {
    const pnJid = index.lidToPn.get(jid);
    if (pnJid) {
      const pnChatName = chatNamesByJid?.get(pnJid);
      if (pnChatName && !isPlaceholderDisplayName(pnChatName, pnJid)) {
        return pnChatName.trim();
      }
      const pnIndexed = index.contactNames.get(pnJid);
      if (pnIndexed && !isPlaceholderDisplayName(pnIndexed, pnJid)) {
        return pnIndexed;
      }
    }
  }

  const trimmedPush = pushName?.trim();
  if (trimmedPush) return trimmedPush;

  return jid.split('@')[0]?.split(':')[0] || 'Unknown';
}
