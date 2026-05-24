import * as SecureStore from 'expo-secure-store';
import { AssistantClient, type ModelInfo, type ModelsResponse } from '@ai-assistant/sdk';
import { API_URL } from './config';

const SESSION_KEY = 'better-auth.session_token';

export const apiClient = new AssistantClient(API_URL, API_URL);

export type ChatMessage = Awaited<
  ReturnType<AssistantClient['getMessages']>
>[number];
export type ChatSession = Awaited<
  ReturnType<AssistantClient['listSessions']>
>[number];
export type { ModelInfo, ModelsResponse };
export type AssistantSocket = ReturnType<AssistantClient['connectSocket']>;
export type SessionInfo = NonNullable<
  Awaited<ReturnType<AssistantClient['getSession']>>
>;

export function getModels(): Promise<ModelsResponse> {
  return apiClient.getModels();
}

export function updatePreferredModel(
  preferredModel: string
): Promise<{ preferredModel: string }> {
  return apiClient.updatePreferredModel(preferredModel);
}

export function transcribeVoice(
  audioUri: string,
  mimeType?: string
): Promise<{ text: string }> {
  return apiClient.transcribeVoice(audioUri, mimeType);
}

const SESSION_FETCH_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Session request timed out')), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function loadStoredSession() {
  const token = await SecureStore.getItemAsync(SESSION_KEY);
  if (!token) return null;

  apiClient.setSessionCookie(`better-auth.session_token=${token}`);
  return withTimeout(apiClient.getSession(), SESSION_FETCH_MS);
}

export async function persistSession() {
  const session = await apiClient.getSession();
  const token = session?.session?.token ?? apiClient.getSessionToken();
  if (token) {
    await SecureStore.setItemAsync(SESSION_KEY, token);
  }
  return session;
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await apiClient.signOut();
}
