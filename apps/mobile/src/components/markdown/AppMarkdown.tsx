import { memo, useMemo } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { EnrichedMarkdownText } from 'react-native-enriched-markdown';
import remend from 'remend';
import * as WebBrowser from 'expo-web-browser';
import { Text } from '@/components/ui/Text';
import { InlineStreamingCursor } from '@/components/chat/StreamingCursor';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { buildMarkdownStyle } from './markdownTheme';
import { looksLikeHtml } from './looksLikeHtml';
import { stripHtmlForDisplay } from './stripHtmlForDisplay';
import { splitMarkdownSegments } from './splitMarkdown';
import { stripFencedBlocks } from './stripFencedBlocks';
import { appendInlineCursor } from './appendInlineCursor';
import { CodeBlock } from './CodeBlock';

export type MarkdownVariant = 'chat' | 'note';

type Props = {
  content: string;
  color: string;
  accentColor: string;
  variant?: MarkdownVariant;
  streaming?: boolean;
  showCursor?: boolean;
  cursorColor?: string;
};

async function openLink(url: string) {
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) return;
    if (Platform.OS === 'web') {
      await Linking.openURL(url);
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  } catch {
    // ignore invalid URLs
  }
}

export const AppMarkdown = memo(function AppMarkdown({
  content,
  color,
  accentColor,
  variant = 'chat',
  streaming = false,
  showCursor = false,
  cursorColor,
}: Props) {
  const { colors } = useTheme();
  const isChat = variant === 'chat';
  const isHtml = useMemo(
    () => !streaming && looksLikeHtml(content),
    [content, streaming]
  );
  const markdownStyle = useMemo(
    () => buildMarkdownStyle(colors, accentColor),
    [colors, accentColor]
  );

  const segments = useMemo(() => {
    if (!content) return [];
    const healed = remend(content);
    return splitMarkdownSegments(healed);
  }, [content]);

  if (!content.trim() && !showCursor) {
    return null;
  }

  if (!content.trim() && showCursor && cursorColor) {
    return (
      <View style={isChat ? styles.chatWrap : styles.noteWrap}>
        <InlineStreamingCursor color={cursorColor} />
      </View>
    );
  }

  if (isHtml) {
    return (
      <View style={styles.htmlFallback}>
        <Text variant="caption" muted>
          Rich HTML formatting is not supported yet. Showing plain text.
        </Text>
        <Text variant="body" style={{ color, marginTop: spacing.xs }}>
          {stripHtmlForDisplay(content)}
          {showCursor && cursorColor ? (
            <InlineStreamingCursor color={cursorColor} />
          ) : null}
        </Text>
      </View>
    );
  }

  const lastIndex = segments.length - 1;

  return (
    <View style={variant === 'note' ? styles.noteWrap : styles.chatWrap}>
      {segments.map((segment, index) => {
        const isLast = index === lastIndex;
        const cursorOnSegment = showCursor && isLast && Boolean(cursorColor);

        if (segment.kind === 'code') {
          return (
            <CodeBlock
              key={`code-${index}`}
              content={segment.text}
              language={segment.language}
              fullWidth
              preferHorizontalScroll={isChat}
              showCursor={cursorOnSegment}
              cursorColor={cursorColor}
            />
          );
        }

        const prose = stripFencedBlocks(segment.text).trim();
        if (!prose) return null;

        const markdown = cursorOnSegment ? appendInlineCursor(prose) : prose;

        return (
          <View
            key={`prose-${index}`}
            style={isChat ? styles.chatProse : undefined}
            collapsable={false}>
            <EnrichedMarkdownText
              markdown={markdown}
              flavor="github"
              markdownStyle={markdownStyle}
              containerStyle={isChat ? styles.chatMarkdownNative : undefined}
              selectable={!streaming}
              allowTrailingMargin={isLast}
              streamingAnimation={streaming && isLast && !cursorOnSegment}
              streamingConfig={streaming && isLast ? { tableMode: 'progressive' } : undefined}
              onLinkPress={({ url }) => void openLink(url)}
            />
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  chatWrap: {
    gap: spacing.xs,
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
    minWidth: 0,
  },
  chatProse: {
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
    minWidth: 0,
  },
  chatMarkdownNative: {
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
    minWidth: 0,
  },
  noteWrap: {
    gap: spacing.xs,
  },
  htmlFallback: {
    gap: spacing.xs,
  },
});
