import type { ReactNode } from 'react';
import { ChatImagePreviewModal } from '@/components/chat/ChatImagePreviewModal';

export function ChatImagePreviewHost({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ChatImagePreviewModal />
    </>
  );
}
