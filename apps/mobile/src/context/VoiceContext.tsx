import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { VoiceSheet } from '@/components/voice/VoiceSheet';

export type VoiceSheetOptions = {
  onTranscript?: (text: string) => void;
};

type VoiceContextValue = {
  openVoiceSheet: (options?: VoiceSheetOptions) => void;
  closeVoiceSheet: () => void;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [onTranscript, setOnTranscript] = useState<VoiceSheetOptions['onTranscript']>();

  const openVoiceSheet = useCallback((options?: VoiceSheetOptions) => {
    setOnTranscript(() => options?.onTranscript);
    sheetRef.current?.present();
  }, []);

  const closeVoiceSheet = useCallback(() => {
    sheetRef.current?.dismiss();
  }, []);

  return (
    <VoiceContext.Provider value={{ openVoiceSheet, closeVoiceSheet }}>
      {children}
      <VoiceSheet ref={sheetRef} onTranscript={onTranscript} />
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider');
  return ctx;
}
