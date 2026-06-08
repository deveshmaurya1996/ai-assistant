export function fitChatImageDimensions(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
  preferFullWidth = false
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: maxWidth, height: Math.round(maxWidth * 0.75) };
  }

  const heightAtFullWidth = maxWidth * (naturalHeight / naturalWidth);
  if (preferFullWidth || heightAtFullWidth <= maxHeight) {
    return {
      width: maxWidth,
      height: Math.max(1, Math.round(Math.min(heightAtFullWidth, maxHeight))),
    };
  }

  const scale = maxHeight / naturalHeight;
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: maxHeight,
  };
}
