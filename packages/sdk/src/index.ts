import { io } from 'socket.io-client';
import { ApiError, parseApiError } from './errors';
import type {
  AssistantSocket,
  ChatMessage,
  ChatSession,
  ModelsResponse,
  UploadFilePayload,
} from './types';

export type * from './types';
export type { Socket } from 'socket.io-client';
export { ApiError, type ApiErrorDetails } from './errors';

export type SessionInfo = {
  user: { id: string; email: string; name: string };
  session: { token: string };
};

export class AssistantClient {
  private baseUrl: string;
  private cookie = '';
  private sessionToken = '';
  private origin: string;

  constructor(baseUrl: string, origin?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.origin = origin ?? this.baseUrl;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Origin: this.origin,
      ...(options.headers as Record<string, string>),
    };
    if (this.cookie) {
      headers.cookie = this.cookie;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length) {
      this.cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
    }

    if (!res.ok) {
      throw await parseApiError(res);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return res.json() as Promise<T>;
    }

    return undefined as T;
  }

  async signUp(email: string, password: string, name: string) {
    await this.request('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    return this.getSession();
  }

  async signIn(email: string, password: string) {
    await this.request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return this.getSession();
  }

  async signInWithGoogle(idToken: string) {
    await this.request('/api/auth/sign-in/social', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken }),
    });
    return this.getSession();
  }

  async getSession(): Promise<SessionInfo | null> {
    const data = await this.request<SessionInfo | null>('/api/auth/get-session');
    if (data?.session?.token) {
      this.sessionToken = data.session.token;
    }
    return data;
  }

  async signOut() {
    await this.request('/api/auth/sign-out', { method: 'POST', body: '{}' });
    this.cookie = '';
    this.sessionToken = '';
  }

  getSessionToken(): string {
    return this.sessionToken;
  }

  setSessionCookie(cookie: string) {
    this.cookie = cookie;
  }

  async listSessions() {
    return this.request<ChatSession[]>('/chat/sessions');
  }

  async createSession(title?: string) {
    return this.request<{ id: string }>('/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  async getMessages(sessionId: string) {
    return this.request<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`);
  }

  connectSocket(sessionToken: string): AssistantSocket {
    return io(this.baseUrl, {
      auth: { token: sessionToken },
      extraHeaders: this.cookie ? { cookie: this.cookie } : undefined,
      transports: ['websocket'],
    });
  }

  async getModels() {
    return this.request<ModelsResponse>('/settings/models');
  }

  async updatePreferredModel(preferredModel: string) {
    return this.request<{ preferredModel: string }>('/settings/model', {
      method: 'PATCH',
      body: JSON.stringify({ preferredModel }),
    });
  }

  async transcribeVoice(
    audioUri: string,
    mimeType = 'audio/m4a'
  ): Promise<{ text: string }> {
    const form = new FormData();
    const file: UploadFilePayload = {
      uri: audioUri,
      name: 'recording.m4a',
      type: mimeType,
    };
    form.append('file', file);

    const headers: Record<string, string> = {
      Origin: this.origin,
    };
    if (this.cookie) {
      headers.cookie = this.cookie;
    }

    const res = await fetch(`${this.baseUrl}/voice/transcribe`, {
      method: 'POST',
      headers,
      body: form,
      credentials: 'include',
    });

    if (!res.ok) {
      throw await parseApiError(res);
    }

    return res.json() as Promise<{ text: string }>;
  }
}
