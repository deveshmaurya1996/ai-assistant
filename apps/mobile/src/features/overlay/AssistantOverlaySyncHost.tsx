import type { ReactNode } from 'react';
import { useAssistantOverlaySync } from './useAssistantOverlaySync';

function AssistantOverlaySyncRunner() {
  useAssistantOverlaySync();
  return null;
}

export function AssistantOverlaySyncHost({ children }: { children: ReactNode }) {
  return (
    <>
      <AssistantOverlaySyncRunner />
      {children}
    </>
  );
}
