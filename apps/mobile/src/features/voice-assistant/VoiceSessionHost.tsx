import type { ReactNode } from 'react';
import { AudioRecorderProvider } from '@siteed/audio-studio';
import { AppChatSocketHost } from '@/features/chat/AppChatSocketHost';
import { AssistantOverlaySyncHost } from '@/features/overlay/AssistantOverlaySyncHost';
import { ReminderNotificationsHost } from '@/features/reminders/ReminderNotificationsHost';
import { VoiceSessionProvider } from './VoiceSessionProvider';

export function VoiceSessionHost({ children }: { children: ReactNode }) {
  return (
    <AudioRecorderProvider>
      <AppChatSocketHost>
        <VoiceSessionProvider>
          <AssistantOverlaySyncHost>
            <ReminderNotificationsHost />
            {children}
          </AssistantOverlaySyncHost>
        </VoiceSessionProvider>
      </AppChatSocketHost>
    </AudioRecorderProvider>
  );
}
