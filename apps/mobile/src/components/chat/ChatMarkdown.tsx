import { View, StyleSheet, Text as RNText } from 'react-native';
import { spacing, typography } from '@/theme/tokens';
import { parseChatMarkdown, type InlinePart } from './parseChatMarkdown';
import { InlineStreamingCursor } from './StreamingCursor';

type Props = {
  content: string;
  color: string;
  accentColor: string;
  showCursor?: boolean;
  cursorColor?: string;
};

function InlineSpans({
  parts,
  color,
  accentColor,
  baseStyle,
}: {
  parts: InlinePart[];
  color: string;
  accentColor: string;
  baseStyle: object;
}) {
  return (
    <RNText style={[baseStyle, { color }]}>
      {parts.map((part, i) => (
        <RNText
          key={`${i}-${part.text.slice(0, 8)}`}
          style={[
            part.bold && styles.bold,
            part.italic && styles.italic,
            part.bold && { color: accentColor },
          ]}>
          {part.text}
        </RNText>
      ))}
    </RNText>
  );
}

function headingStyle(level: 1 | 2 | 3) {
  if (level === 1) return typography.h1;
  if (level === 2) return typography.h2;
  return typography.bodyMedium;
}

export function ChatMarkdown({
  content,
  color,
  accentColor,
  showCursor = false,
  cursorColor,
}: Props) {
  const blocks = parseChatMarkdown(content);

  if (!blocks.length) {
    return showCursor && cursorColor ? (
      <InlineStreamingCursor color={cursorColor} />
    ) : null;
  }

  return (
    <View style={styles.root}>
      {blocks.map((block, index) => {
        const isLast = index === blocks.length - 1;

        if (block.type === 'spacer') {
          return <View key={`sp-${index}`} style={styles.spacer} />;
        }

        if (block.type === 'heading') {
          return (
            <View key={`h-${index}`} style={index > 0 ? styles.blockGap : undefined}>
              <InlineSpans
                parts={block.parts}
                color={accentColor}
                accentColor={accentColor}
                baseStyle={headingStyle(block.level)}
              />
              {isLast && showCursor && cursorColor ? (
                <InlineStreamingCursor color={cursorColor} />
              ) : null}
            </View>
          );
        }

        if (block.type === 'bullet') {
          const marker = block.ordered ? `${block.index ?? 1}.` : '•';
          return (
            <View key={`b-${index}`} style={[styles.bulletRow, index > 0 ? styles.tightGap : undefined]}>
              <RNText style={[typography.body, styles.marker, { color }]}>{marker}</RNText>
              <View style={styles.bulletBody}>
                <InlineSpans
                  parts={block.parts}
                  color={color}
                  accentColor={accentColor}
                  baseStyle={typography.body}
                />
                {isLast && showCursor && cursorColor ? (
                  <InlineStreamingCursor color={cursorColor} />
                ) : null}
              </View>
            </View>
          );
        }

        return (
          <View key={`p-${index}`} style={index > 0 ? styles.blockGap : undefined}>
            <InlineSpans
              parts={block.parts}
              color={color}
              accentColor={accentColor}
              baseStyle={typography.body}
            />
            {isLast && showCursor && cursorColor ? (
              <InlineStreamingCursor color={cursorColor} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  blockGap: {
    marginTop: spacing.sm,
  },
  tightGap: {
    marginTop: 2,
  },
  spacer: {
    height: spacing.xs,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  marker: {
    minWidth: 22,
    marginTop: 1,
  },
  bulletBody: {
    flex: 1,
  },
  bold: {
    fontFamily: 'Inter_600SemiBold',
  },
  italic: {
    fontStyle: 'italic',
  },
});
