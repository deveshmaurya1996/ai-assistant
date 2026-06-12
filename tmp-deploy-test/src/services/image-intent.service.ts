export type ImageIntent = 'image' | 'image_edit';

export function classifyImageIntent(
  query: string,
  hasImageAttachment = false
): ImageIntent | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  if (
    /\b(analyze|describe|read|ocr|extract text|what(?:'s| is) in (?:this|the) (?:image|photo|file|document|pdf|screenshot))\b/.test(
      q
    )
  ) {
    return null;
  }

  const editSignals = [
    /\b(edit|modify|retouch|inpaint|change|alter|update)\b/,
    /\b(remove|add|replace|erase)\b.+\b(from|in|on)\b/,
    /\bmake\b.+\b(sky|background|hair|color|colou?r)\b/,
    /\b(the|this|that|previous|last)\s+(generated\s+)?(image|picture|photo)\b/,
  ];

  if (hasImageAttachment && editSignals.some((p) => p.test(q))) {
    return 'image_edit';
  }

  const generateSignals = [
    /\b(generate|create|draw|design|render|paint|illustrate|sketch)\b/,
    /\b(make|produce)\b.+\b(image|picture|photo|illustration|logo|poster|artwork|icon)\b/,
    /\b(image|picture|photo|illustration|logo|poster)\b.+\b(of|showing|with|featuring)\b/,
    /\bdraw\b.+\b(me|a|an)\b/,
    /\bshow me\b.+\b(picture|image|photo|illustration)\b/,
    /\bmake me\b.+\b(an?\s+)?(image|picture|photo|illustration)\b/,
  ];

  if (generateSignals.some((p) => p.test(q))) {
    return 'image';
  }

  return null;
}
