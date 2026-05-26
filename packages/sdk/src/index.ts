import { io, type Socket } from 'socket.io-client';
import { ApiError, parseApiError } from './errors';
import { buildAudioUploadPart } from './upload-audio';
import type {
  AuthUser,
  ChatMessage,
  ChatSession,
  ClientToServerEvents,
  ConnectChallenge,
  CreateChatSessionBody,
  CreateChatSessionResponse,
  ModelsResponse,
  PreferredModelUpdate,
  Reminder,
  Automation,
  CreateWorkflowInput,
  Workflow,
  ServerToClientEvents,
  SessionInfo,
  ToolExecutionResult,
  UploadFilePayload,
  UserConnection,
  VoiceTranscriptionResponse,
  WhatsAppSessionStatus,
  UserNote,
  CreateNoteBody,
} from '@ai-assistant/types';

export type * from '@ai-assistant/types';
export type { Socket } from 'socket.io-client';
export type AssistantSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export { ApiError, type ApiErrorDetails } from './errors';

export type AuthCredentials = {
  cookie: string;
  token?: string;
};

export type AuthProvider = () => Promise<AuthCredentials | null>;

export class AssistantClient {
  private baseUrl: string;
  private cookie = '';
  private sessionToken = '';
  private origin: string;
  private authProvider?: AuthProvider;

  constructor(baseUrl: string, origin?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.origin = origin ?? this.baseUrl;
  }

  setAuthProvider(provider: AuthProvider | undefined) {
    this.authProvider = provider;
  }

  private async resolveAuth(): Promise<void> {
    if (!this.authProvider) return;
    const creds = await this.authProvider();
    if (!creds) return;
    if (creds.cookie) {
      this.cookie = creds.cookie;
    }
    if (creds.token) {
      this.sessionToken = creds.token;
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    await this.resolveAuth();

    const method = (options.method ?? 'GET').toUpperCase();
    let body = options.body;
    if (
      ['POST', 'PUT', 'PATCH'].includes(method) &&
      (body === undefined || body === null || body === '')
    ) {
      body = '{}';
    }

    const headers: Record<string, string> = {
      Origin: this.origin,
      ...(options.headers as Record<string, string>),
    };
    if (this.cookie) {
      headers.cookie = this.cookie;
    }
    const hasBody = body !== undefined && body !== null && body !== '';
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      method,
      body,
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

  async getChatSession(sessionId: string) {
    return this.request<ChatSession>(`/chat/sessions/${sessionId}`);
  }

  async createSession(options?: string | CreateChatSessionBody) {
    const body: CreateChatSessionBody =
      typeof options === 'string' ? { title: options } : (options ?? {});
    return this.request<CreateChatSessionResponse>('/chat/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getMessages(sessionId: string) {
    return this.request<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`);
  }

  async deleteSession(sessionId: string) {
    return this.request<{ success: boolean }>(`/chat/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  async connectSocket(sessionToken?: string): Promise<AssistantSocket> {
    await this.resolveAuth();
    const token = sessionToken ?? this.sessionToken;
    return io(this.baseUrl, {
      auth: { token },
      extraHeaders: this.cookie ? { cookie: this.cookie } : undefined,
      transports: ['websocket'],
    });
  }

  async getModels() {
    return this.request<ModelsResponse>('/settings/models');
  }

  async updatePreferredModel(preferredModel: string) {
    return this.request<PreferredModelUpdate>('/settings/model', {
      method: 'PATCH',
      body: JSON.stringify({ preferredModel }),
    });
  }

  async transcribeVoice(
    audioUri: string,
    mimeType = 'audio/m4a'
  ): Promise<VoiceTranscriptionResponse> {
    const file = await buildAudioUploadPart(audioUri, mimeType);
    if (file instanceof Blob) {
      const name =
        'name' in file && typeof file.name === 'string' && file.name.length > 0
          ? file.name
          : mimeType.includes('webm')
            ? 'recording.webm'
            : 'recording.m4a';
      return this.transcribeVoiceBlob(file, name);
    }
    return this.transcribeVoicePart(file);
  }

  async transcribeVoiceBlob(
    file: Blob,
    filename: string
  ): Promise<VoiceTranscriptionResponse> {
    const form = new FormData();
    form.append('file', file, filename);
    return this.postVoiceTranscribeForm(form);
  }

  async transcribeVoicePart(
    part: UploadFilePayload
  ): Promise<VoiceTranscriptionResponse> {
    const form = new FormData();
    form.append('file', part);
    return this.postVoiceTranscribeForm(form);
  }

  private async postVoiceTranscribeForm(
    form: FormData
  ): Promise<VoiceTranscriptionResponse> {
    await this.resolveAuth();

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

    return res.json() as Promise<VoiceTranscriptionResponse>;
  }

  async speakVoice(text: string): Promise<ArrayBuffer> {
    await this.resolveAuth();

    const headers: Record<string, string> = {
      Origin: this.origin,
      'Content-Type': 'application/json',
    };
    if (this.cookie) {
      headers.cookie = this.cookie;
    }

    const res = await fetch(`${this.baseUrl}/voice/speak`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
      credentials: 'include',
    });

    if (!res.ok) {
      throw await parseApiError(res);
    }

    return res.arrayBuffer();
  }

  async listIntegrationProviders() {
    return this.request<{ providers: unknown[]; connectors: unknown[] }>(
      '/integrations/providers'
    );
  }

  async listConnections(): Promise<UserConnection[]> {
    return this.request<UserConnection[]>('/integrations/connections');
  }

  async connectProvider(provider: string): Promise<ConnectChallenge & { connectionId?: string }> {
    return this.request(`/integrations/${provider}/connect`, { method: 'POST' });
  }

  async getWhatsAppLinkSession(connectionId: string): Promise<
    WhatsAppSessionStatus & { connectionId: string; bridgeSessionId?: string }
  > {
    return this.request(`/integrations/connections/${connectionId}/whatsapp/session`);
  }

  async requestWhatsAppPairing(connectionId: string, phoneNumber: string) {
    return this.request<{
      sessionId: string;
      pairingCode?: string;
      pairingPhone?: string;
      status: string;
    }>(`/integrations/connections/${connectionId}/whatsapp/pairing`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    });
  }

  async activateConnection(connectionId: string) {
    return this.request(`/integrations/connections/${connectionId}/activate`, {
      method: 'POST',
    });
  }

  async disconnectConnection(connectionId: string) {
    return this.request(`/integrations/connections/${connectionId}`, { method: 'DELETE' });
  }

  async searchIntegrations(q: string) {
    return this.request<{ results: unknown[] }>(
      `/integrations/search?q=${encodeURIComponent(q)}`
    );
  }

  async executeTool(body: {
    tool: string;
    args: Record<string, unknown>;
    source?: string;
    confirmed?: boolean;
    preview?: boolean;
    connectionId?: string;
    chatSessionId?: string;
  }): Promise<ToolExecutionResult> {
    return this.request('/tools/execute', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async cancelToolExecution(executionId: string) {
    return this.request(`/tools/executions/${executionId}`, { method: 'DELETE' });
  }

  async listWorkflows(): Promise<Workflow[]> {
    return this.request<Workflow[]>('/workflows');
  }

  async createWorkflow(body: CreateWorkflowInput): Promise<Workflow> {
    return this.request('/workflows', { method: 'POST', body: JSON.stringify(body) });
  }

  async runWorkflow(id: string) {
    return this.request(`/workflows/${id}/run`, { method: 'POST' });
  }

  async listAutomations(): Promise<Automation[]> {
    return this.request<Automation[]>('/automations');
  }

  async listReminders(): Promise<Reminder[]> {
    return this.request<Reminder[]>('/reminders');
  }

  async createReminder(body: { fireAt: string; payload: Record<string, unknown> }) {
    return this.request<Reminder>('/reminders', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async deleteReminder(id: string) {
    return this.request(`/reminders/${id}`, { method: 'DELETE' });
  }

  async listNotes(): Promise<UserNote[]> {
    return this.request<UserNote[]>('/notes');
  }

  async createNote(body: CreateNoteBody): Promise<UserNote> {
    return this.request<UserNote>('/notes', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getSavedMessageIds(sessionId: string): Promise<string[]> {
    const params = new URLSearchParams({ sessionId });
    return this.request<string[]>(`/notes/saved-message-ids?${params.toString()}`);
  }

  async deleteNote(id: string) {
    return this.request(`/notes/${id}`, { method: 'DELETE' });
  }
}
