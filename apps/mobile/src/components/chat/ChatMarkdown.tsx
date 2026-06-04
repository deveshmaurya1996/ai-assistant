import { AppMarkdown } from '@/components/markdown/AppMarkdown';

type Props = {
  content: string;
  color: string;
  accentColor: string;
  showCursor?: boolean;
  cursorColor?: string;
};

export function ChatMarkdown(props: Props) {
  return <AppMarkdown {...props} variant="chat" streaming={false} />;
}
