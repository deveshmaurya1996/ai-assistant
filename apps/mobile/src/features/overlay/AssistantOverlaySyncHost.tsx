import type { ReactNode } from 'react';
import { useAssistantOverlaySync } from './useAssistantOverlaySync';
import { useOverlayOpenNavigation } from './useOverlayOpenNavigation';

function AssistantOverlaySyncRunner() {
  useAssistantOverlaySync();
  useOverlayOpenNavigation();
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
