import type { ReactNode } from 'react';
import { getAuthSessionToken } from '@/lib/auth-cookies';
import { useAuthStore } from '@/stores/auth';
import { ChatSocketProvider } from './ChatSocketProvider';

export function AppChatSocketHost({ children }: { children: ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const sessionToken = session
    ? (session.session?.token ?? getAuthSessionToken())
    : undefined;

  return (
    <ChatSocketProvider sessionToken={sessionToken}>{children}</ChatSocketProvider>
  );
}
