import type { Href } from 'expo-router';

export const Routes = {
  welcome: '/(auth)/welcome' as Href,
  login: '/(auth)/login' as Href,
  register: '/(auth)/register' as Href,
  terms: '/(auth)/terms' as Href,
  chatCompose: '/(app)/chat/compose' as Href,
  assistant: '/(app)/assistant' as Href,
  settings: '/(app)/settings' as Href,
  integrations: { pathname: '/(app)/integrations' } as Href,
  automations: { pathname: '/(app)/automations' } as Href,
  automationsReminders: {
    pathname: '/(app)/automations',
    params: { tab: 'reminders' },
  } as Href,
  notes: '/(app)/notes' as Href,
  memory: '/(app)/settings/memory' as Href,
  authCallback: '/auth/callback' as Href,
} as const;

export function chatSessionRoute(
  id: string,
  params?: { title?: string; kind?: string }
): Href {
  return {
    pathname: '/(app)/chat/[id]',
    params: { id, ...params },
  };
}

export function assistantRoute(params?: { resumeSessionId?: string }): Href {
  if (params?.resumeSessionId) {
    return {
      pathname: '/assistant',
      params: { resumeSessionId: params.resumeSessionId },
    } as Href;
  }
  return '/assistant' as Href;
}

export function integrationProviderRoute(
  provider: string,
  params?: { connectionId?: string }
): Href {
  return {
    pathname: '/(app)/integrations/[provider]',
    params: { provider, ...params },
  };
}
