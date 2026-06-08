import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import QRCode from 'qrcode';
import { getBaileys, type BaileysSocket } from './baileys-loader';
import { syncWhatsAppMessage } from './message-sync';
import { getWhatsAppAuthRoot } from './auth-paths';
import { markWhatsAppDisconnectedForUser } from './connection-lifecycle';

export type SessionStatus = 'pending' | 'active' | 'disconnected';

export interface SessionState {
  sessionId: string;
  userId: string;
  state: string;
  status: SessionStatus;
  qrData?: string;
  pairingCode?: string;
  pairingPhone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatEntry {
  jid: string;
  name: string;
  unreadCount?: number;
}

export interface CachedMessage {
  id: string;
  jid: string;
  fromMe: boolean;
  body: string;
  timestamp: string;
  pushName?: string;
}

export interface UnreadChatItem {
  chatId: string;
  sender: string;
  preview: string;
  timestamp: string;
  unreadCount: number;
}

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? 'warn' });

const AUTH_ROOT = getWhatsAppAuthRoot();

export function formatPairingCode(code: string): string {
  const raw = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  }
  if (raw.length === 6 && /^\d+$/.test(raw)) {
    return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  }
  return raw;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function toJid(to: string): string {
  if (to.includes('@')) return to;
  const digits = normalizePhone(to);
  return `${digits}@s.whatsapp.net`;
}

function authDirFor(sessionId: string): string {
  return path.join(AUTH_ROOT, sessionId);
}

async function authDirExists(sessionId: string): Promise<boolean> {
  try {
    await access(authDirFor(sessionId));
    return true;
  } catch {
    return false;
  }
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();
  private sockets = new Map<string, BaileysSocket>();
  private connectionPhases = new Map<string, string>();
  private starting = new Set<string>();
  private persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private chatCache = new Map<string, ChatEntry[]>();
  private messageCache = new Map<string, Map<string, CachedMessage[]>>();
  private unreadCounts = new Map<string, Map<string, number>>();

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getSocket(sessionId: string): BaileysSocket | undefined {
    return this.sockets.get(sessionId);
  }

  async getOrRestoreSession(sessionId: string): Promise<SessionState> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      await this.ensureSocket(sessionId);
      return existing;
    }

    if (await authDirExists(sessionId)) {
      const metaPath = path.join(authDirFor(sessionId), 'session.json');
      try {
        const raw = await readFile(metaPath, 'utf8');
        const saved = JSON.parse(raw) as SessionState;
        this.sessions.set(sessionId, { ...saved, sessionId });
        await this.ensureSocket(sessionId);
        const restored = this.sessions.get(sessionId);
        if (restored) return restored;
      } catch {
        /* recreate from baileys auth files */
      }
    }

    throw new Error('Session not found');
  }

  async createSession(userId: string, state: string): Promise<SessionState> {
    const sessionId = `wa_${userId}_${Date.now()}`;
    const now = new Date().toISOString();
    const session: SessionState = {
      sessionId,
      userId,
      state,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(sessionId, session);
    this.chatCache.set(sessionId, []);
    void this.persistSessionMeta(session, true);
    void this.ensureSocket(sessionId).catch((err) => {
      logger.warn({ err, sessionId }, 'WhatsApp socket start failed');
    });
    return session;
  }

  async requestPairingCode(sessionId: string, phoneNumber: string): Promise<SessionState> {
    const session = await this.getOrRestoreSession(sessionId);
    const sock = await this.ensureSocket(sessionId);

    if (session.status === 'active') {
      return session;
    }

    const normalized = normalizePhone(phoneNumber);
    if (normalized.length < 10) {
      throw new Error('Enter a valid phone number with country code (digits only)');
    }

    if (sock.authState.creds.registered) {
      throw new Error('Session already registered — use QR or tap Connect again');
    }

    try {
      await sock.waitForSocketOpen();
    } catch {
      throw new Error('WhatsApp is still connecting — wait a moment and try again');
    }

    const code = await sock.requestPairingCode(normalized);
    session.pairingPhone = normalized;
    session.pairingCode = formatPairingCode(code);
    session.updatedAt = new Date().toISOString();
    void this.persistSessionMeta(session, true);
    return session;
  }

  async sendMessage(
    sessionId: string,
    to: string,
    message: string
  ): Promise<{ sent: boolean; to: string; messageId?: string }> {
    const session = await this.getOrRestoreSession(sessionId);
    if (session.status !== 'active') {
      throw new Error('Session not active. Link WhatsApp first.');
    }
    const sock = await this.ensureSocket(sessionId);
    const jid = toJid(to);
    const result = await sock.sendMessage(jid, { text: message });
    return {
      sent: true,
      to: jid,
      messageId: result?.key?.id ?? undefined,
    };
  }

  async searchChats(
    sessionId: string,
    query: string
  ): Promise<{ chats: ChatEntry[] }> {
    const session = await this.getOrRestoreSession(sessionId);
    if (session.status !== 'active') {
      throw new Error('Session not active. Link WhatsApp first.');
    }
    const sock = await this.ensureSocket(sessionId);
    const { jidNormalizedUser } = await getBaileys();
    const q = query.trim().toLowerCase();

    let cached = this.chatCache.get(sessionId) ?? [];
    if (cached.length === 0) {
      await this.waitForChatCache(sessionId, sock, 8_000);
      cached = this.chatCache.get(sessionId) ?? [];
    }

    if (!q) {
      return { chats: cached };
    }

    let matches = cached.filter(
      (c) => c.name.toLowerCase().includes(q) || c.jid.toLowerCase().includes(q)
    );

    const digits = normalizePhone(query);
    if (matches.length === 0 && digits.length >= 10) {
      try {
        const results = await sock.onWhatsApp(digits);
        const found = results?.find((r) => r.exists);
        if (found?.jid) {
          const jid = jidNormalizedUser(found.jid);
          matches = [{ jid, name: digits }];
          this.upsertChatCache(sessionId, { jid, name: digits });
        }
      } catch (err) {
        logger.warn({ err, sessionId }, 'onWhatsApp lookup failed');
      }
    }

    return { chats: matches.slice(0, 20) };
  }

  /** After cold start, Baileys may still be syncing chats — wait briefly. */
  private async waitForChatCache(
    sessionId: string,
    sock: BaileysSocket,
    timeoutMs: number
  ): Promise<void> {
    if ((this.chatCache.get(sessionId)?.length ?? 0) > 0) return;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        sock.ev.off('chats.upsert', onChats);
        sock.ev.off('contacts.upsert', onContacts);
        resolve();
      }, timeoutMs);

      const done = () => {
        if ((this.chatCache.get(sessionId)?.length ?? 0) > 0) {
          clearTimeout(timer);
          sock.ev.off('chats.upsert', onChats);
          sock.ev.off('contacts.upsert', onContacts);
          resolve();
        }
      };

      const onChats = () => done();
      const onContacts = () => done();
      sock.ev.on('chats.upsert', onChats);
      sock.ev.on('contacts.upsert', onContacts);
    });
  }

  async listUnread(
    sessionId: string,
    limit = 20
  ): Promise<{
    type: string;
    items: UnreadChatItem[];
    totalUnread: number;
  }> {
    const session = await this.getOrRestoreSession(sessionId);
    if (session.status !== 'active') {
      throw new Error('Session not active. Link WhatsApp first.');
    }

    const chats = this.chatCache.get(sessionId) ?? [];
    const msgByJid = this.messageCache.get(sessionId) ?? new Map();
    const unreadMap = this.unreadCounts.get(sessionId) ?? new Map();

    const items: UnreadChatItem[] = [];

    for (const chat of chats) {
      const unread = unreadMap.get(chat.jid) ?? chat.unreadCount ?? 0;
      const messages = msgByJid.get(chat.jid) ?? [];
      const last = messages[messages.length - 1];
      if (unread > 0 || last) {
        items.push({
          chatId: chat.jid,
          sender: chat.name || chat.jid.split('@')[0] || 'Unknown',
          preview: last?.body?.slice(0, 500) ?? '(no preview yet)',
          timestamp: last?.timestamp ?? new Date().toISOString(),
          unreadCount: unread > 0 ? unread : 1,
        });
      }
    }

    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const sock = (await this.ensureSocket(sessionId)) as BaileysSocket & {
      fetchMessagesFromWA?: (jid: string, count: number) => Promise<unknown[]>;
    };

    if (items.length < limit && typeof sock.fetchMessagesFromWA === 'function') {
      for (const chat of chats.slice(0, Math.min(limit, 10))) {
        if (items.some((i) => i.chatId === chat.jid && i.preview !== '(no preview yet)')) {
          continue;
        }
        try {
          const raw = await sock.fetchMessagesFromWA(chat.jid, 5);
          const parsed = this.parseBaileysMessages(chat.jid, raw);
          if (parsed.length > 0) {
            this.storeMessages(sessionId, chat.jid, parsed);
            const last = parsed[parsed.length - 1]!;
            const existing = items.findIndex((i) => i.chatId === chat.jid);
            const row: UnreadChatItem = {
              chatId: chat.jid,
              sender: chat.name || last.pushName || chat.jid.split('@')[0] || 'Unknown',
              preview: last.body.slice(0, 500),
              timestamp: last.timestamp,
              unreadCount: unreadMap.get(chat.jid) ?? 1,
            };
            if (existing >= 0) items[existing] = row;
            else items.push(row);
          }
        } catch (err) {
          logger.warn({ err, sessionId, jid: chat.jid }, 'fetchMessagesFromWA failed');
        }
      }
    }

    const sliced = items.slice(0, limit);
    return {
      type: 'messaging.unread_list',
      items: sliced,
      totalUnread: sliced.reduce((n, i) => n + i.unreadCount, 0),
    };
  }

  async readChat(
    sessionId: string,
    chatId: string,
    limit = 25
  ): Promise<{
    type: string;
    chatId: string;
    messages: Array<{
      id: string;
      sender: string;
      body: string;
      timestamp: string;
      fromMe: boolean;
    }>;
  }> {
    const session = await this.getOrRestoreSession(sessionId);
    if (session.status !== 'active') {
      throw new Error('Session not active. Link WhatsApp first.');
    }

    const jid = chatId.includes('@') ? chatId : toJid(chatId);
    let cached = this.messageCache.get(sessionId)?.get(jid) ?? [];

    if (cached.length < limit) {
      const sock = (await this.ensureSocket(sessionId)) as BaileysSocket & {
        fetchMessagesFromWA?: (jid: string, count: number) => Promise<unknown[]>;
      };
      if (typeof sock.fetchMessagesFromWA === 'function') {
        try {
          const raw = await sock.fetchMessagesFromWA(jid, limit);
          const parsed = this.parseBaileysMessages(jid, raw);
          if (parsed.length > 0) {
            this.storeMessages(sessionId, jid, parsed);
            cached = this.messageCache.get(sessionId)?.get(jid) ?? parsed;
          }
        } catch (err) {
          logger.warn({ err, sessionId, jid }, 'readChat fetch failed');
        }
      }
    }

    const chatName =
      this.chatCache.get(sessionId)?.find((c) => c.jid === jid)?.name ??
      jid.split('@')[0] ??
      'Unknown';

    const messages = cached.slice(-limit).map((m) => ({
      id: m.id,
      sender: m.fromMe ? 'You' : m.pushName || chatName,
      body: m.body,
      timestamp: m.timestamp,
      fromMe: m.fromMe,
    }));

    const unreadMap = this.unreadCounts.get(sessionId);
    if (unreadMap) unreadMap.set(jid, 0);

    return {
      type: 'messaging.conversation',
      chatId: jid,
      messages,
    };
  }

  private parseBaileysMessages(jid: string, raw: unknown): CachedMessage[] {
    if (!Array.isArray(raw)) return [];
    const out: CachedMessage[] = [];
    for (const item of raw) {
      const msg = item as Record<string, unknown>;
      const key = msg.key as { id?: string; fromMe?: boolean; remoteJid?: string } | undefined;
      const message = msg.message as Record<string, unknown> | undefined;
      if (!key?.id) continue;
      let body = '';
      if (message?.conversation) {
        body = String(message.conversation);
      } else if (message && (message.extendedTextMessage as { text?: string })?.text) {
        body = String((message.extendedTextMessage as { text?: string }).text);
      } else if (message?.imageMessage) {
        body = '[image]';
      } else if (message?.videoMessage) {
        body = '[video]';
      } else if (message?.audioMessage) {
        body = '[audio]';
      }
      const ts = msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();
      out.push({
        id: key.id,
        jid: key.remoteJid ?? jid,
        fromMe: Boolean(key.fromMe),
        body: String(body || '').trim() || '[media]',
        timestamp: ts,
        pushName: (msg.pushName as string) ?? undefined,
      });
    }
    return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private storeMessages(sessionId: string, jid: string, messages: CachedMessage[]): void {
    if (!this.messageCache.has(sessionId)) {
      this.messageCache.set(sessionId, new Map());
    }
    const byJid = this.messageCache.get(sessionId)!;
    const existing = byJid.get(jid) ?? [];
    const byId = new Map(existing.map((m) => [m.id, m]));
    for (const m of messages) {
      byId.set(m.id, m);
    }
    const merged = [...byId.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    byJid.set(jid, merged.slice(-200));
  }

  private bumpUnread(sessionId: string, jid: string): void {
    if (!this.unreadCounts.has(sessionId)) {
      this.unreadCounts.set(sessionId, new Map());
    }
    const map = this.unreadCounts.get(sessionId)!;
    map.set(jid, (map.get(jid) ?? 0) + 1);
  }

  private upsertChatCache(sessionId: string, entry: ChatEntry): void {
    const list = this.chatCache.get(sessionId) ?? [];
    if (!list.some((c) => c.jid === entry.jid)) {
      list.push(entry);
      this.chatCache.set(sessionId, list);
    }
  }

  private persistSessionMeta(session: SessionState, immediate = false): void {
    const run = () => {
      const dir = authDirFor(session.sessionId);
      void mkdir(dir, { recursive: true }).then(() =>
        writeFile(path.join(dir, 'session.json'), JSON.stringify(session), 'utf8')
      );
    };

    if (immediate) {
      run();
      return;
    }

    const existing = this.persistTimers.get(session.sessionId);
    if (existing) clearTimeout(existing);
    this.persistTimers.set(
      session.sessionId,
      setTimeout(() => {
        this.persistTimers.delete(session.sessionId);
        run();
      }, 800)
    );
  }

  private async waitForConnectionPhase(
    sessionId: string,
    phase: 'connecting' | 'open',
    timeoutMs: number
  ): Promise<void> {
    const sock = this.sockets.get(sessionId);
    if (!sock) {
      await this.waitForSocket(sessionId, timeoutMs);
    }
    const activeSock = this.sockets.get(sessionId);
    if (!activeSock) {
      throw new Error('WhatsApp socket failed to start');
    }

    const currentPhase = this.connectionPhases.get(sessionId);
    if (phase === 'connecting' && (currentPhase === 'connecting' || currentPhase === 'open')) {
      return;
    }
    if (phase === 'open' && this.sessions.get(sessionId)?.status === 'active') {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        activeSock.ev.off('connection.update', onUpdate);
        reject(new Error('WhatsApp connection timed out — try again'));
      }, timeoutMs);

      const onUpdate = (update: { connection?: string }) => {
        if (update.connection === phase) {
          clearTimeout(timeout);
          activeSock.ev.off('connection.update', onUpdate);
          resolve();
        }
      };

      activeSock.ev.on('connection.update', onUpdate);
    });
  }

  private async ensureSocket(sessionId: string): Promise<BaileysSocket> {
    const existing = this.sockets.get(sessionId);
    if (existing) return existing;

    if (this.starting.has(sessionId)) {
      await this.waitForSocket(sessionId, 30_000);
      const sock = this.sockets.get(sessionId);
      if (sock) return sock;
    }

    if (!this.sessions.get(sessionId) && (await authDirExists(sessionId))) {
      const metaPath = path.join(authDirFor(sessionId), 'session.json');
      try {
        const raw = await readFile(metaPath, 'utf8');
        const saved = JSON.parse(raw) as SessionState;
        this.sessions.set(sessionId, { ...saved, sessionId });
        if (!this.chatCache.has(sessionId)) {
          this.chatCache.set(sessionId, []);
        }
      } catch {
        throw new Error('Session not found');
      }
    }

    if (!this.sessions.get(sessionId)) {
      throw new Error('Session not found');
    }

    this.starting.add(sessionId);
    try {
      await this.startSocket(sessionId);
      await this.waitForSocket(sessionId, 30_000);
    } finally {
      this.starting.delete(sessionId);
    }

    const sock = this.sockets.get(sessionId);
    if (!sock) {
      throw new Error('WhatsApp socket failed to start — try Connect again');
    }
    return sock;
  }

  private async waitForSocket(sessionId: string, timeoutMs: number): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (this.sockets.has(sessionId)) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  private async startSocket(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const previous = this.sockets.get(sessionId);
    if (previous) {
      try {
        previous.end(undefined);
      } catch {
        /* ignore */
      }
      this.sockets.delete(sessionId);
    }

    const authDir = authDirFor(sessionId);
    await mkdir(authDir, { recursive: true });

    const baileys = await getBaileys();
    const { state: authState, saveCreds } = await baileys.useMultiFileAuthState(authDir);
    const { version } = await baileys.fetchLatestBaileysVersion();

    const sock = baileys.default({
      version,
      logger,
      printQRInTerminal: false,
      browser: baileys.Browsers.macOS('Chrome'),
      auth: {
        creds: authState.creds,
        keys: baileys.makeCacheableSignalKeyStore(authState.keys, logger),
      },
      markOnlineOnConnect: false,
      syncFullHistory: false,
      connectTimeoutMs: 30_000,
      defaultQueryTimeoutMs: 20_000,
    });

    this.sockets.set(sessionId, sock);
    this.connectionPhases.set(sessionId, 'connecting');

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      void this.persistSessionMeta(session);
    });

    sock.ev.on('chats.upsert', (chats) => {
      for (const chat of chats) {
        const c = chat as { id?: string; name?: string; unreadCount?: number };
        const jid = c.id ?? '';
        const name = c.name ?? jid.split('@')[0] ?? jid;
        if (jid) {
          this.upsertChatCache(sessionId, {
            jid,
            name,
            unreadCount: c.unreadCount,
          });
          if (c.unreadCount && c.unreadCount > 0) {
            if (!this.unreadCounts.has(sessionId)) {
              this.unreadCounts.set(sessionId, new Map());
            }
            this.unreadCounts.get(sessionId)!.set(jid, c.unreadCount);
          }
        }
      }
    });

    sock.ev.on('messages.upsert', (event) => {
      const { messages, type } = event as {
        messages?: unknown[];
        type?: string;
      };
      if (!messages?.length) return;
      for (const item of messages) {
        const msg = item as { key?: { remoteJid?: string; fromMe?: boolean; id?: string } };
        const jid = msg.key?.remoteJid;
        if (!jid) continue;
        const parsed = this.parseBaileysMessages(jid, [item]);
        if (parsed.length === 0) continue;
        const m = parsed[0]!;
        this.storeMessages(sessionId, jid, [m]);
        const chatName = this.chatCache.get(sessionId)?.find((c) => c.jid === jid)?.name;
        void syncWhatsAppMessage(sessionId, jid, m, chatName);
        if (!m.fromMe && type === 'notify') {
          this.bumpUnread(sessionId, jid);
          const name = m.pushName ?? jid.split('@')[0] ?? jid;
          this.upsertChatCache(sessionId, { jid, name });
        }
      }
    });

    sock.ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts) {
        const jid = contact.id ?? '';
        const name = contact.name ?? contact.notify ?? jid.split('@')[0] ?? jid;
        if (jid) this.upsertChatCache(sessionId, { jid, name });
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const current = this.sessions.get(sessionId);
      if (!current) return;

      if (update.connection) {
        this.connectionPhases.set(sessionId, update.connection);
      }

      if (update.qr) {
        try {
          current.qrData = await QRCode.toDataURL(update.qr, {
            margin: 2,
            width: 320,
            color: { dark: '#128C7E', light: '#FFFFFF' },
          });
          current.updatedAt = new Date().toISOString();
          void this.persistSessionMeta(current);
        } catch (err) {
          logger.error({ err }, 'QR encode failed');
        }
      }

      if (update.connection === 'open') {
        current.status = 'active';
        current.updatedAt = new Date().toISOString();
        void this.persistSessionMeta(current, true);
        logger.info({ sessionId }, 'WhatsApp linked');
      }

      if (update.connection === 'close') {
        const statusCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } })
          ?.output?.statusCode;
        if (statusCode === baileys.DisconnectReason.loggedOut) {
          current.status = 'disconnected';
          current.updatedAt = new Date().toISOString();
          this.sockets.delete(sessionId);
          this.connectionPhases.delete(sessionId);
          void this.persistSessionMeta(current, true);
          void markWhatsAppDisconnectedForUser(current.userId).catch((err) => {
            logger.warn({ err, userId: current.userId }, 'Failed to mark WhatsApp disconnected in DB');
          });
          return;
        }
        if (current.status !== 'active' && !this.starting.has(sessionId)) {
          this.sockets.delete(sessionId);
          this.connectionPhases.delete(sessionId);
          void this.ensureSocket(sessionId).catch((err) => {
            logger.warn({ err, sessionId }, 'WhatsApp reconnect failed');
          });
        }
      }
    });
  }
}

export const sessionManager = new SessionManager();
