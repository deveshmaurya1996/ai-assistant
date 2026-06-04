import { memo } from 'react';
import { AppMarkdown } from '@/components/markdown/AppMarkdown';
import { useSmoothStreamText } from '@/features/chat/useSmoothStreamText';

type Props = {
  content: string;
  color: string;
  accentColor?: string;
  showCursor?: boolean;
  cursorColor?: string;
  revealActive?: boolean;
};

export const ChatStreamingText = memo(function ChatStreamingText({
  content,
  color,
  accentColor,
  showCursor = false,
  cursorColor,
  revealActive = true,
}: Props) {
  const accent = accentColor ?? color;
  const revealed = useSmoothStreamText(content, revealActive);
  const showContent = Boolean(revealed.trim()) || showCursor;

  if (!showContent) {
    return null;
  }

  return (
    <AppMarkdown
      content={revealed}
      color={color}
      accentColor={accent}
      variant="chat"
      streaming
      showCursor={showCursor}
      cursorColor={cursorColor}
    />
  );
});
