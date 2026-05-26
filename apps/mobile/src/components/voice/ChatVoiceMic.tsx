import { VoiceMicButton } from '@/components/voice/VoiceMicButton';

type Props = {
  isRecording: boolean;
  isProcessing: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function ChatVoiceMic({
  isRecording,
  isProcessing,
  disabled = false,
  onPress,
}: Props) {
  return (
    <VoiceMicButton
      isRecording={isRecording}
      isProcessing={isProcessing}
      disabled={disabled}
      onPress={onPress}
      variant="composer"
    />
  );
}
