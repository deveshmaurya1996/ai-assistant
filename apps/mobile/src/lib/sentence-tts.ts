const SENTENCE_END = /[.!?]\s+/;

export function drainCompleteSentences(buffer: string, minLength = 12): {
  sentences: string[];
  remainder: string;
} {
  const sentences: string[] = [];
  let rest = buffer;

  while (rest.length >= minLength) {
    const match = SENTENCE_END.exec(rest);
    if (!match) break;
    const end = match.index + match[0].length;
    const sentence = rest.slice(0, end).trim();
    if (sentence.length >= minLength) {
      sentences.push(sentence);
      rest = rest.slice(end);
    } else {
      break;
    }
  }

  return { sentences, remainder: rest };
}
