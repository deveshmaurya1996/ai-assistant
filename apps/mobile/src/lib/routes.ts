import type { Href } from 'expo-router';

export const Routes = {
  welcome: '/(auth)/welcome' as Href,
  login: '/(auth)/login' as Href,
  register: '/(auth)/register' as Href,
  terms: '/(auth)/terms' as Href,
  chats: '/(app)/(main)/chats' as Href,
  assistant: '/(app)/(main)/assistant' as Href,
  settings: '/(app)/(main)/settings' as Href,
  chatCompose: '/(app)/chat/compose' as Href,
  integrations: { pathname: '/(app)/integrations' } as Href,
  automations: { pathname: '/(app)/automations' } as Href,
  automationsReminders: { pathname: '/(app)/automations/reminders' } as Href,
  notes: '/(app)/notes' as Href,
  authCallback: '/auth/callback' as Href,
} as const;

export function chatSessionRoute(id: string): Href {
  return {
    pathname: '/(app)/chat/[id]',
    params: { id },
  };
}

export function integrationProviderRoute(
  provider: string,
  params?: { connectionId?: string }
): Href {
  return {
    pathname: '/(app)/integrations/[provider]',
    params: {
      provider,
      connectionId: params?.connectionId ?? '',
    },
  };
}
