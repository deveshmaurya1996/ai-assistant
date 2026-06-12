import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { getBaileys, type BaileysSocket } from './baileys-loader';
import {
  createBaileysLogger,
  createMsgRetryCounterCache,
  createShouldIgnoreJid,
} from './baileys-socket-support';
import { isActionableWhatsAppJid } from './jid-policy';
import {
  countSyncedThreads,
  loadChatsFromDb,
  loadMessagesFromDb,
  loadUnreadFromDb,
  preloadRecentMessages,
  syncWhatsAppChatsBatch,
  syncWhatsAppHistoryMessages,
  syncWhatsAppMessage,
} from './message-sync';
import { getWhatsAppAuthRoot } from './auth-paths';
import {
  authDirExists,
  drainAuthPersistence,
  ensureAuthDirLocal,
  persistBaileysCredentials,
  pushAuthDirToRemote,
  resetLinkingAuthStore,
} from './auth-remote';
import { markConnectionActive, markWhatsAppDisconnectedForUser } from './connection-lifecycle';
import { repairWhatsAppConnectionMetadata } from './session-resolve';
import { normalizeWhatsAppPairingPhone } from './phone-normalize';
import { prisma } from '@ai-assistant/database';

export type SessionStatus = 'pending' | 'active' | 'disconnected';

export interface SessionState {
  sessionId: string;
  userId: string;
  state: string;
  status: SessionStatus;
  qrData?: string;
  pairingCode?: string;
  pairingPhone?: string;
  pairingInProgress?: boolean;
  pairingCodeIssuedAt?: string;
  pairingInvalidatedAt?: string;
  pairingAccepted?: boolean;
  historySyncComplete?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const PAIRING_CODE_TTL_MS = 120_000;
export const PAIRING_REQUEST_TIMEOUT_MS = 45_000;

export function isPairingCodeExpired(issuedAt?: string): boolean {
  if (!issuedAt) return true;
  return Date.now() - new Date(issuedAt).getTime() >= PAIRING_CODE_TTL_MS;
}

export function pairingCodeExpiresAt(issuedAt?: string): string | undefined {
  if (!issuedAt) return undefined;
  return new Date(new Date(issuedAt).getTime() + PAIRING_CODE_TTL_MS).toISOString();
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

const logger = createBaileysLogger();

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
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12 && digits[2] === '0') {
    digits = `91${digits.slice(3)}`;
  }
  if (digits.length > 10 && digits.startsWith('0')) {
    digits = digits.replace(/^0+/, '');
  }
  return digits;
}

function toJid(to: string): string {
  if (to.includes('@')) return to;
  const digits = normalizePhone(to);
  return `${digits}@s.whatsapp.net`;
}

function authDirFor(sessionId: string): string {
  return path.join(AUTH_ROOT, sessionId);
}

function getDisconnectStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const err = error as { output?: { statusCode?: number }; statusCode?: number };
  return err.output?.statusCode ?? err.statusCode;
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
  private rawMessageCache = new Map<string, Map<string, unknown>>();
  private qrSignaled = new Set<string>();
  private authEpoch = new Map<string, number>();
  private reconnecting = new Set<string>();

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getSocket(sessionId: string): BaileysSocket | undefined {
    return this.sockets.get(sessionId);
  }

  getConnectionPhase(sessionId: string): string | undefined {
    return this.connectionPhases.get(sessionId);
  }

  isReconnecting(sessionId: string): boolean {
    return this.reconnecting.has(sessionId);
  }

  private async waitForReconnect(sessionId: string, timeoutMs = 90_000): Promise<void> {
    const started = Date.now();
    while (this.reconnecting.has(sessionId) && Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  private isLinking(session: SessionState): boolean {
    return session.status === 'pending';
  }

  private isActivePhonePairing(session: SessionState): boolean {
    return !!(
      session.pairingInProgress ||
      (session.pairingCode && !isPairingCodeExpired(session.pairingCodeIssuedAt))
    );
  }

  private bumpAuthEpoch(sessionId: string): void {
    this.authEpoch.set(sessionId, (this.authEpoch.get(sessionId) ?? 0) + 1);
  }

  private teardownSocket(sessionId: string): void {
    const socket = this.sockets.get(sessionId);
    if (socket) {
      try {
        socket.end(undefined);
      } catch {
        /* ignore */
      }
      this.sockets.delete(sessionId);
    }
    this.connectionPhases.delete(sessionId);
    this.qrSignaled.delete(sessionId);
  }

  private async loadSessionRecord(sessionId: string): Promise<SessionState> {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    const authDir = authDirFor(sessionId);
    if (!(await authDirExists(sessionId, authDir))) {
      throw new Error('Session not found');
    }

    await ensureAuthDirLocal(sessionId, authDir);
    const metaPath = path.join(authDir, 'session.json');
    try {
      const raw = await readFile(metaPath, 'utf8');
      const saved = JSON.parse(raw) as SessionState;
      const session = { ...saved, sessionId };
      this.sessions.set(sessionId, session);
      if (!this.chatCache.has(sessionId)) {
        this.chatCache.set(sessionId, []);
      }
      void repairWhatsAppConnectionMetadata(saved.userId, sessionId);
      void this.hydrateFromDatabase(sessionId);
      return session;
    } catch {
      throw new Error('Session not found');
    }
  }

  private async assertLinkingSession(sessionId: string): Promise<SessionState> {
    const session = await this.loadSessionRecord(sessionId);

    if (session.status === 'active') {
      return session;
    }

    if (session.status === 'disconnected') {
      session.status = 'pending';
      this.clearPairingState(session, false);
      session.updatedAt = new Date().toISOString();
      await this.persistSessionMetaNow(session);
    }

    if (session.status !== 'pending') {
      throw new Error('WhatsApp session expired. Go back and tap Connect again.');
    }

    return session;
  }

  private async resetLinkingAuth(sessionId: string): Promise<void> {
    const authDir = authDirFor(sessionId);
    await ensureAuthDirLocal(sessionId, authDir);
    await drainAuthPersistence(sessionId);
    this.bumpAuthEpoch(sessionId);
    await resetLinkingAuthStore(sessionId, authDir);
  }

  private async ensureLinkingSocket(
    sessionId: string,
    options?: { resetAuth?: boolean; fromReconnect?: boolean }
  ): Promise<BaileysSocket> {
    await this.assertLinkingSession(sessionId);

    if (options?.resetAuth) {
      this.teardownSocket(sessionId);
      await this.resetLinkingAuth(sessionId);
    }

    const existing = this.sockets.get(sessionId);
    if (existing) return existing;

    return this.ensureSocket(sessionId, { fromReconnect: options?.fromReconnect });
  }

  private recoverLinkingAfterClose(
    sessionId: string,
    options: { resetAuth?: boolean; invalidatePairing?: boolean }
  ): void {
    const current = this.sessions.get(sessionId);
    if (!current) return;
    if (this.reconnecting.has(sessionId)) return;

    if (options.invalidatePairing && current.pairingCode) {
      this.clearPairingState(current, true);
      void this.persistSessionMetaNow(current);
    }

    this.reconnecting.add(sessionId);

    const reconnect = async () => {
      try {
        await drainAuthPersistence(sessionId);
        this.teardownSocket(sessionId);
        if (options.resetAuth) {
          await this.resetLinkingAuth(sessionId);
        }
        if (this.isLinking(current)) {
          await this.ensureLinkingSocket(sessionId, { fromReconnect: true });
        } else {
          await this.ensureSocket(sessionId, { fromReconnect: true });
        }
      } finally {
        this.reconnecting.delete(sessionId);
      }
    };

    void reconnect().catch((err) => {
      logger.warn({ err, sessionId }, 'WhatsApp reconnect after close failed');
    });
  }

  private clearPairingState(session: SessionState, invalidated: boolean): void {
    const hadCode = !!session.pairingCode;
    session.pairingCode = undefined;
    session.pairingPhone = undefined;
    session.pairingInProgress = false;
    session.pairingCodeIssuedAt = undefined;
    if (invalidated && hadCode) {
      session.pairingInvalidatedAt = new Date().toISOString();
      session.pairingAccepted = false;
    } else if (!invalidated) {
      session.pairingInvalidatedAt = undefined;
    }
    session.updatedAt = new Date().toISOString();
  }

  async getOrRestoreSession(sessionId: string): Promise<SessionState> {
    const session = await this.loadSessionRecord(sessionId);

    if (session.status === 'active') {
      await this.ensureSocket(sessionId);
      return session;
    }

    await this.ensureLinkingSocket(sessionId);
    return this.sessions.get(sessionId) ?? session;
  }

  async getLinkingSessionState(sessionId: string): Promise<SessionState> {
    const session = await this.assertLinkingSession(sessionId);
    const live = this.sessions.get(sessionId) ?? session;

    if (live.status === 'active') {
      return live;
    }

    if (this.reconnecting.has(sessionId) || live.pairingAccepted) {
      return this.sessions.get(sessionId) ?? live;
    }

    if (!this.sockets.has(sessionId) && !this.starting.has(sessionId)) {
      void this.ensureLinkingSocket(sessionId).catch((err) => {
        logger.warn({ err, sessionId }, 'WhatsApp background linking socket start failed');
      });
    }

    return this.sessions.get(sessionId) ?? live;
  }

  async getLinkingSession(sessionId: string): Promise<SessionState> {
    const session = await this.assertLinkingSession(sessionId);
    await this.waitForReconnect(sessionId);
    await this.ensureLinkingSocket(sessionId);
    return this.sessions.get(sessionId) ?? session;
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const socket = this.sockets.get(sessionId);
    if (socket) {
      try {
        socket.end(undefined);
      } catch {
        /* ignore */
      }
      this.sockets.delete(sessionId);
    }
    this.connectionPhases.delete(sessionId);
    this.starting.delete(sessionId);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'disconnected';
      session.updatedAt = new Date().toISOString();
      this.persistSessionMeta(session, true);
      return;
    }

    const authDir = authDirFor(sessionId);
    const metaPath = path.join(authDir, 'session.json');
    try {
      await ensureAuthDirLocal(sessionId, authDir);
      const raw = await readFile(metaPath, 'utf8');
      const saved = JSON.parse(raw) as SessionState;
      saved.status = 'disconnected';
      saved.updatedAt = new Date().toISOString();
      await writeFile(metaPath, JSON.stringify(saved), 'utf8');
      await pushAuthDirToRemote(sessionId, authDir);
    } catch {
      /* no session on disk */
    }
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
    await this.persistSessionMetaNow(session);
    void this.ensureLinkingSocket(sessionId).catch((err) => {
      logger.warn({ err, sessionId }, 'WhatsApp socket start failed');
    });
    return session;
  }

  async restartPendingSession(sessionId: string): Promise<SessionState> {
    const session = await this.loadSessionRecord(sessionId);
    if (session.status === 'active') return session;

    session.status = 'pending';
    session.updatedAt = new Date().toISOString();
    await this.persistSessionMetaNow(session);

    this.teardownSocket(sessionId);
    await this.resetLinkingAuth(sessionId);
    await this.ensureLinkingSocket(sessionId);

    const refreshed = this.sessions.get(sessionId);
    if (!refreshed) throw new Error('WhatsApp session could not be restarted');
    return refreshed;
  }

  async requestPairingCode(
    sessionId: string,
    phoneNumber: string,
    options?: { countryCode?: string; forceRefresh?: boolean }
  ): Promise<SessionState> {
    const countryCode = options?.countryCode?.replace(/\D/g, '') || '91';
    const forceRefresh = options?.forceRefresh ?? false;

    let normalized: string;
    try {
      normalized = normalizeWhatsAppPairingPhone(phoneNumber, countryCode);
    } catch {
      normalized = normalizePhone(phoneNumber);
      if (normalized.length < 10) {
        throw new Error('Enter a valid phone number with country code (digits only)');
      }
    }

    const session = await this.assertLinkingSession(sessionId);
    if (session.status === 'active') {
      return session;
    }

    logger.info({ sessionId, pairingPhone: normalized }, 'Requesting WhatsApp pairing code');

    const existingSock = this.sockets.get(sessionId);
    const needsAuthReset =
      forceRefresh ||
      session.pairingPhone !== normalized ||
      !!existingSock?.authState.creds.registered;

    if (forceRefresh || session.pairingPhone !== normalized) {
      this.clearPairingState(session, false);
    }

    const sock = await this.ensureLinkingSocket(sessionId, { resetAuth: needsAuthReset });

    if (sock.authState.creds.registered) {
      throw new Error('Session already registered — disconnect WhatsApp and tap Connect again');
    }

    try {
      await sock.waitForSocketOpen();
    } catch {
      throw new Error('WhatsApp is still connecting — wait a moment and try again');
    }

    let code: string;
    try {
      code = await Promise.race([
        sock.requestPairingCode(normalized),
        new Promise<string>((_, reject) => {
          setTimeout(
            () => reject(new Error('Pairing timed out — tap Get new code')),
            PAIRING_REQUEST_TIMEOUT_MS
          );
        }),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pairing code request failed';
      throw new Error(
        `Could not start phone linking for ${normalized}. Check the number matches your WhatsApp account. (${message})`
      );
    }

    session.pairingPhone = normalized;
    session.pairingCode = formatPairingCode(code);
    session.pairingInProgress = true;
    session.pairingCodeIssuedAt = new Date().toISOString();
    session.pairingInvalidatedAt = undefined;
    session.updatedAt = session.pairingCodeIssuedAt;
    await this.persistSessionMetaNow(session);
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

    await this.waitForChatCache(sessionId, sock, 15_000);
    const fromDb = await loadChatsFromDb(sessionId);
    const merged = this.mergeChatLists(this.chatCache.get(sessionId) ?? [], fromDb);
    if (merged.length > 0) {
      this.chatCache.set(sessionId, merged);
    }
    let cached = merged;

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
      const cleanup = () => {
        sock.ev.off('chats.set', onChats);
        sock.ev.off('chats.upsert', onChats);
        sock.ev.off('messaging-history.set', onHistory);
        sock.ev.off('contacts.upsert', onContacts);
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, timeoutMs);

      const done = () => {
        if ((this.chatCache.get(sessionId)?.length ?? 0) > 0) {
          clearTimeout(timer);
          cleanup();
          resolve();
        }
      };

      const onChats = () => done();
      const onContacts = () => done();
      const onHistory = () => done();
      sock.ev.on('chats.set', onChats);
      sock.ev.on('chats.upsert', onChats);
      sock.ev.on('messaging-history.set', onHistory);
      sock.ev.on('contacts.upsert', onContacts);
    });
  }

  /** Rehydrate in-memory caches from Postgres after gateway restart (Baileys data store pattern). */
  private async hydrateFromDatabase(sessionId: string): Promise<void> {
    const chats = await loadChatsFromDb(sessionId);
    if (chats.length === 0) return;

    const existing = this.chatCache.get(sessionId) ?? [];
    const byJid = new Map(existing.map((c) => [c.jid, c]));
    for (const chat of chats) {
      const prev = byJid.get(chat.jid);
      byJid.set(chat.jid, prev ? { ...prev, ...chat } : chat);
    }
    this.chatCache.set(sessionId, [...byJid.values()]);

    if (!this.unreadCounts.has(sessionId)) {
      this.unreadCounts.set(sessionId, new Map());
    }
    const unreadMap = this.unreadCounts.get(sessionId)!;
    for (const chat of chats) {
      if (chat.unreadCount && chat.unreadCount > 0) {
        unreadMap.set(chat.jid, chat.unreadCount);
      }
    }

    const preloaded = await preloadRecentMessages(
      sessionId,
      chats.map((c) => c.jid)
    );
    for (const [jid, msgs] of preloaded) {
      this.storeMessages(sessionId, jid, msgs);
    }
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

    const sock = await this.ensureSocket(sessionId);
    await this.waitForChatCache(sessionId, sock, 30_000);
    const fromDbChats = await loadChatsFromDb(sessionId);
    const chats = this.mergeChatLists(this.chatCache.get(sessionId) ?? [], fromDbChats);
    if (chats.length > 0) {
      this.chatCache.set(sessionId, chats);
    }
    const msgByJid = this.messageCache.get(sessionId) ?? new Map();
    const unreadMap = this.unreadCounts.get(sessionId) ?? new Map();

    const items: UnreadChatItem[] = [];

    for (const chat of chats) {
      const unread = unreadMap.get(chat.jid) ?? chat.unreadCount ?? 0;
      if (unread <= 0) continue;
      const messages = msgByJid.get(chat.jid) ?? [];
      let last = messages[messages.length - 1];
      if (!last) {
        const fromDb = await loadMessagesFromDb(sessionId, chat.jid, 1);
        if (fromDb.length > 0) {
          last = fromDb[fromDb.length - 1];
          this.storeMessages(sessionId, chat.jid, fromDb);
        }
      }
      items.push({
        chatId: chat.jid,
        sender: chat.name || chat.jid.split('@')[0] || 'Unknown',
        preview: last?.body?.slice(0, 500) ?? '(no preview yet)',
        timestamp: last?.timestamp ?? new Date().toISOString(),
        unreadCount: unread,
      });
    }

    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    let sliced = items.slice(0, limit);

    if (sliced.length === 0) {
      const dbItems = await loadUnreadFromDb(sessionId, limit);
      if (dbItems.length > 0) {
        sliced = dbItems;
      } else if (chats.length === 0) {
        const syncedThreads = await countSyncedThreads(sessionId);
        if (syncedThreads === 0) {
          throw new Error(
            'WhatsApp is linked but chats have not synced yet. Keep your phone online, open WhatsApp, wait a few seconds, and try again.'
          );
        }
      }
    }

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
    displayName: string;
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
        fetchMessageHistory?: (
          count: number,
          oldestMsgKey: unknown,
          oldestMsgTimestamp: number
        ) => Promise<unknown>;
      };
      if (typeof sock.fetchMessageHistory === 'function' && cached.length > 0) {
        try {
          const oldest = cached[0]!;
          const result = await sock.fetchMessageHistory(limit, { remoteJid: jid, id: oldest.id }, 0);
          const raw = (result as { messages?: unknown[] })?.messages ?? [];
          const parsed = this.parseBaileysMessages(jid, raw);
          if (parsed.length > 0) {
            this.storeMessages(sessionId, jid, parsed);
            cached = this.messageCache.get(sessionId)?.get(jid) ?? parsed;
          }
        } catch (err) {
          logger.warn({ err, sessionId, jid }, 'fetchMessageHistory failed');
        }
      }
    }

    if (cached.length < limit) {
      const fromDb = await loadMessagesFromDb(sessionId, jid, limit);
      if (fromDb.length > 0) {
        this.storeMessages(sessionId, jid, fromDb);
        cached = this.messageCache.get(sessionId)?.get(jid) ?? fromDb;
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

    return {
      type: 'messaging.conversation',
      chatId: jid,
      displayName: chatName,
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

  private storeRawMessage(sessionId: string, jid: string, id: string, raw: unknown): void {
    if (!this.rawMessageCache.has(sessionId)) {
      this.rawMessageCache.set(sessionId, new Map());
    }
    this.rawMessageCache.get(sessionId)!.set(`${jid}:${id}`, raw);
  }

  private storeMessages(
    sessionId: string,
    jid: string,
    messages: CachedMessage[],
    rawItems?: unknown[]
  ): void {
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

    if (rawItems?.length) {
      for (const item of rawItems) {
        const msg = item as { key?: { id?: string; remoteJid?: string } };
        const id = msg.key?.id;
        const itemJid = msg.key?.remoteJid ?? jid;
        if (id) this.storeRawMessage(sessionId, itemJid, id, item);
      }
    }
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
    const idx = list.findIndex((c) => c.jid === entry.jid);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...entry };
    } else {
      list.push(entry);
    }
    this.chatCache.set(sessionId, list);
  }

  private mergeChatLists(a: ChatEntry[], b: ChatEntry[]): ChatEntry[] {
    const byJid = new Map<string, ChatEntry>();
    for (const chat of [...a, ...b]) {
      const prev = byJid.get(chat.jid);
      byJid.set(chat.jid, prev ? { ...prev, ...chat } : chat);
    }
    return [...byJid.values()].sort((x, y) => {
      const ux = x.unreadCount ?? 0;
      const uy = y.unreadCount ?? 0;
      if (ux !== uy) return uy - ux;
      return x.name.localeCompare(y.name);
    });
  }

  private mapChatRows(chats: unknown[]): Array<{ jid: string; name: string; unreadCount?: number }> {
    const rows: Array<{ jid: string; name: string; unreadCount?: number }> = [];
    for (const chat of chats) {
      const c = chat as { id?: string; name?: string; unreadCount?: number };
      const jid = c.id ?? '';
      const name = c.name ?? jid.split('@')[0] ?? jid;
      if (jid && isActionableWhatsAppJid(jid)) rows.push({ jid, name, unreadCount: c.unreadCount });
    }
    return rows;
  }

  private ingestChats(sessionId: string, chats: unknown[]): void {
    for (const chat of chats) {
      const c = chat as { id?: string; name?: string; unreadCount?: number };
      const jid = c.id ?? '';
      const name = c.name ?? jid.split('@')[0] ?? jid;
      if (!jid || !isActionableWhatsAppJid(jid)) continue;
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

  private ingestChatUpdates(sessionId: string, updates: unknown[]): void {
    for (const update of updates) {
      const u = update as { id?: string; name?: string; unreadCount?: number };
      const jid = u.id ?? '';
      if (!jid || !isActionableWhatsAppJid(jid)) continue;
      const existing = this.chatCache.get(sessionId)?.find((c) => c.jid === jid);
      const name = u.name ?? existing?.name ?? jid.split('@')[0] ?? jid;
      this.upsertChatCache(sessionId, {
        jid,
        name,
        unreadCount: u.unreadCount ?? existing?.unreadCount,
      });
      if (typeof u.unreadCount === 'number') {
        if (!this.unreadCounts.has(sessionId)) {
          this.unreadCounts.set(sessionId, new Map());
        }
        const map = this.unreadCounts.get(sessionId)!;
        if (u.unreadCount > 0) map.set(jid, u.unreadCount);
        else map.delete(jid);
      }
    }
  }

  private async persistSessionMetaNow(session: SessionState): Promise<void> {
    const dir = authDirFor(session.sessionId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'session.json'), JSON.stringify(session), 'utf8');
    await pushAuthDirToRemote(session.sessionId, dir);
  }

  private persistSessionMeta(session: SessionState, immediate = false): void {
    const run = () => {
      void this.persistSessionMetaNow(session);
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

  private async ensureSocket(
    sessionId: string,
    options?: { fromReconnect?: boolean }
  ): Promise<BaileysSocket> {
    if (!options?.fromReconnect) {
      await this.waitForReconnect(sessionId);
    }

    const existing = this.sockets.get(sessionId);
    if (existing) return existing;

    if (this.starting.has(sessionId)) {
      await this.waitForSocket(sessionId, 30_000);
      const sock = this.sockets.get(sessionId);
      if (sock) return sock;
    }

    if (!this.sessions.get(sessionId)) {
      await this.loadSessionRecord(sessionId);
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

    this.qrSignaled.delete(sessionId);

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
    await ensureAuthDirLocal(sessionId, authDir);
    await mkdir(authDir, { recursive: true });

    await repairWhatsAppConnectionMetadata(session.userId, sessionId);
    await this.hydrateFromDatabase(sessionId);

    const baileys = await getBaileys();
    const { state: authState, saveCreds } = await baileys.useMultiFileAuthState(authDir);
    const authEpoch = this.authEpoch.get(sessionId) ?? 0;
    const isAuthEpochValid = () => (this.authEpoch.get(sessionId) ?? 0) === authEpoch;
    const persistBaileysAuth = () =>
      persistBaileysCredentials(sessionId, authDir, saveCreds, isAuthEpochValid);
    const { version } = await baileys.fetchLatestBaileysVersion();

    const syncedThreads = await countSyncedThreads(sessionId);
    const isLinking = this.isLinking(session);
    if (isLinking && session.pairingCode && !this.isActivePhonePairing(session)) {
      this.clearPairingState(session, false);
      void this.persistSessionMetaNow(session);
    }
    const wantsFullHistory =
      !isLinking && (!session.historySyncComplete || syncedThreads < 25);

    const sock = baileys.default({
      version,
      logger,
      printQRInTerminal: false,
      // Chrome fingerprint is required for QR + phone pairing (Desktop breaks linking).
      browser: isLinking
        ? baileys.Browsers.macOS('Chrome')
        : baileys.Browsers.macOS('Desktop'),
      auth: {
        creds: authState.creds,
        keys: baileys.makeCacheableSignalKeyStore(authState.keys, logger),
      },
      markOnlineOnConnect: false,
      syncFullHistory: wantsFullHistory,
      shouldSyncHistoryMessage: () => true,
      shouldIgnoreJid: createShouldIgnoreJid(),
      msgRetryCounterCache: createMsgRetryCounterCache(),
      getMessage: async (key: { remoteJid?: string | null; id?: string | null }) => {
        const jid = key.remoteJid;
        const id = key.id;
        if (!jid || !id) return undefined;
        return this.rawMessageCache.get(sessionId)?.get(`${jid}:${id}`);
      },
      connectTimeoutMs: 90_000,
      defaultQueryTimeoutMs: 120_000,
      keepAliveIntervalMs: 25_000,
    });

    this.sockets.set(sessionId, sock);
    this.connectionPhases.set(sessionId, 'connecting');

    sock.ev.on('creds.update', () => {
      void persistBaileysAuth();
      void this.persistSessionMeta(session);
    });

    sock.ev.on('chats.set', (chats) => {
      this.ingestChats(sessionId, chats);
      void syncWhatsAppChatsBatch(sessionId, this.mapChatRows(chats));
    });

    sock.ev.on('chats.upsert', (chats) => {
      this.ingestChats(sessionId, chats);
      void syncWhatsAppChatsBatch(sessionId, this.mapChatRows(chats));
    });

    sock.ev.on('chats.update', (updates: unknown[]) => {
      this.ingestChatUpdates(sessionId, updates);
      const rows: Array<{ jid: string; name: string; unreadCount?: number }> = [];
      for (const update of updates) {
        const u = update as { id?: string; name?: string; unreadCount?: number };
        const jid = u.id ?? '';
        if (!jid || !isActionableWhatsAppJid(jid)) continue;
        const existing = this.chatCache.get(sessionId)?.find((c) => c.jid === jid);
        rows.push({
          jid,
          name: u.name ?? existing?.name ?? jid.split('@')[0] ?? jid,
          unreadCount: u.unreadCount ?? existing?.unreadCount,
        });
      }
      void syncWhatsAppChatsBatch(sessionId, rows);
    });

    sock.ev.on('messaging-history.set', (event) => {
      const payload = event as {
        chats?: unknown[];
        messages?: unknown[];
        isLatest?: boolean;
      };
      if (payload.chats?.length) {
        this.ingestChats(sessionId, payload.chats);
        void syncWhatsAppChatsBatch(sessionId, this.mapChatRows(payload.chats));
      }
      if (payload.messages?.length) {
        const batch: Array<{ jid: string; message: CachedMessage; displayName?: string }> = [];
        for (const item of payload.messages) {
          const msg = item as { key?: { remoteJid?: string } };
          const jid = msg.key?.remoteJid;
          if (!jid || !isActionableWhatsAppJid(jid)) continue;
          const parsed = this.parseBaileysMessages(jid, [item]);
          if (parsed.length > 0) {
            this.storeMessages(sessionId, jid, parsed, [item]);
            const chatName = this.chatCache.get(sessionId)?.find((c) => c.jid === jid)?.name;
            for (const m of parsed) {
              batch.push({ jid, message: m, displayName: chatName });
            }
          }
        }
        void syncWhatsAppHistoryMessages(sessionId, batch);
      }
      if (payload.isLatest) {
        const current = this.sessions.get(sessionId);
        if (current) {
          void countSyncedThreads(sessionId).then((threadCount) => {
            if (threadCount >= 25) {
              current.historySyncComplete = true;
            }
            current.updatedAt = new Date().toISOString();
            void this.persistSessionMeta(current, true);
          });
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
        if (!jid || !isActionableWhatsAppJid(jid)) continue;
        const parsed = this.parseBaileysMessages(jid, [item]);
        if (parsed.length === 0) continue;
        const m = parsed[0]!;
        this.storeMessages(sessionId, jid, [m], [item]);
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
      const rows: Array<{ jid: string; name: string }> = [];
      for (const contact of contacts) {
        const jid = contact.id ?? '';
        const name = contact.name ?? contact.notify ?? jid.split('@')[0] ?? jid;
        if (jid) {
          this.upsertChatCache(sessionId, { jid, name });
          rows.push({ jid, name });
        }
      }
      if (rows.length > 0) {
        void syncWhatsAppChatsBatch(sessionId, rows);
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const current = this.sessions.get(sessionId);
      if (!current) return;

      if (update.connection) {
        this.connectionPhases.set(sessionId, update.connection);
      }

      if (update.qr) {
        this.qrSignaled.add(sessionId);
        if (!this.isActivePhonePairing(current)) {
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
      }

      if (update.isNewLogin) {
        logger.info({ sessionId }, 'WhatsApp pairing accepted — saving credentials before restart');
        current.pairingInProgress = true;
        current.pairingAccepted = true;
        current.updatedAt = new Date().toISOString();
        void this.persistSessionMeta(current, true);
        await persistBaileysAuth();
      }

      if (update.connection === 'open') {
        current.status = 'active';
        current.pairingAccepted = false;
        this.clearPairingState(current, false);
        current.updatedAt = new Date().toISOString();
        void this.persistSessionMeta(current, true);
        void this.hydrateFromDatabase(sessionId);
        void repairWhatsAppConnectionMetadata(current.userId, sessionId);
        void prisma.userConnection
          .findFirst({
            where: { userId: current.userId, providerId: 'whatsapp' },
            select: { id: true, status: true },
          })
          .then((connection) => {
            if (connection && connection.status !== 'ACTIVE') {
              return markConnectionActive({
                userId: current.userId,
                connectionId: connection.id,
                providerId: 'whatsapp',
              });
            }
            return undefined;
          })
          .catch((err) => {
            logger.warn({ err, sessionId }, 'WhatsApp auto-activate failed');
          });
        logger.info({ sessionId }, 'WhatsApp linked');
      }

      if (update.connection === 'close') {
        const statusCode = getDisconnectStatusCode(update.lastDisconnect?.error);
        const wasLinking = this.isLinking(current);
        const conflictReplaced = statusCode === 440;

        if (conflictReplaced) {
          if (wasLinking) {
            logger.warn({ sessionId }, 'WhatsApp link conflict during pairing — recovering');
            this.recoverLinkingAfterClose(sessionId, { resetAuth: true, invalidatePairing: true });
          } else {
            current.status = 'disconnected';
            current.updatedAt = new Date().toISOString();
            this.teardownSocket(sessionId);
            void this.hydrateFromDatabase(sessionId);
            void this.persistSessionMeta(current, true);
            logger.warn({ sessionId }, 'WhatsApp session replaced by another linked device');
          }
          return;
        }

        if (statusCode === baileys.DisconnectReason.loggedOut) {
          if (wasLinking) {
            logger.info({ sessionId }, 'WhatsApp logged out during link — resetting auth');
            this.recoverLinkingAfterClose(sessionId, { resetAuth: true, invalidatePairing: true });
          } else {
            current.status = 'disconnected';
            current.updatedAt = new Date().toISOString();
            this.teardownSocket(sessionId);
            void this.persistSessionMeta(current, true);
            void markWhatsAppDisconnectedForUser(current.userId).catch((err) => {
              logger.warn({ err, userId: current.userId }, 'Failed to mark WhatsApp disconnected in DB');
            });
          }
          return;
        }

        if (statusCode === baileys.DisconnectReason.restartRequired) {
          logger.info({ sessionId }, 'WhatsApp restart required after pairing — reconnecting');
          this.recoverLinkingAfterClose(sessionId, {
            resetAuth: false,
            invalidatePairing: false,
          });
          return;
        }

        if (wasLinking && this.isActivePhonePairing(current)) {
          logger.info(
            { sessionId, statusCode },
            'WhatsApp transient disconnect during pairing — recovering'
          );
          this.recoverLinkingAfterClose(sessionId, {
            resetAuth: false,
            invalidatePairing: false,
          });
          return;
        }

        if (current.status !== 'active' && !this.starting.has(sessionId)) {
          if (wasLinking) {
            this.recoverLinkingAfterClose(sessionId, {
              resetAuth: false,
              invalidatePairing: false,
            });
          } else {
            this.teardownSocket(sessionId);
            void this.ensureSocket(sessionId).catch((err) => {
              logger.warn({ err, sessionId }, 'WhatsApp reconnect failed');
            });
          }
        }
      }
    });
  }
}

export const sessionManager = new SessionManager();
