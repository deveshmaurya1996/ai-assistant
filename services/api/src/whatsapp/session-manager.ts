import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import QRCode from 'qrcode';
import { getBaileys, type BaileysSocket } from './baileys-loader';

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
}

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? 'warn' });

const AUTH_ROOT =
  process.env.WHATSAPP_AUTH_DIR ?? path.join(process.cwd(), 'data', 'wa-auth');

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
    if (!q) {
      return { chats: this.chatCache.get(sessionId) ?? [] };
    }

    const cached = this.chatCache.get(sessionId) ?? [];
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
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
    });

    this.sockets.set(sessionId, sock);
    this.connectionPhases.set(sessionId, 'connecting');

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      void this.persistSessionMeta(session);
    });

    sock.ev.on('chats.upsert', (chats) => {
      for (const chat of chats) {
        const jid = chat.id ?? '';
        const name = chat.name ?? jid.split('@')[0] ?? jid;
        if (jid) this.upsertChatCache(sessionId, { jid, name });
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
