export const ICONIFY_API = 'https://api.iconify.design';
export const LOBEHUB_CDN =
  'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.91.0/icons';

const svgCache = new Map<string, string>();

export function isLobehubIcon(icon: string): boolean {
  return icon.trim().startsWith('lobehub:');
}

export function normalizeIconId(icon: string): string {
  const trimmed = icon.trim();
  if (!trimmed) return '';
  if (isLobehubIcon(trimmed)) return trimmed;
  if (trimmed.includes(':')) return trimmed;
  return `mdi:${trimmed}`;
}

function lobehubSvgUrl(icon: string): string {
  const name = icon.slice('lobehub:'.length);
  return `${LOBEHUB_CDN}/${name}.svg`;
}

function sanitizeSvgColors(svg: string): string {
  return svg.replace(/%23([0-9A-Fa-f]{3,8})/gi, '#$1');
}

function applySvgColor(svg: string, color: string): string {
  const tinted = sanitizeSvgColors(svg);
  if (tinted.includes('currentColor')) {
    return tinted.replace(/currentColor/g, color);
  }
  return tinted
    .replace(/fill="(?!none")[^"]*"/gi, `fill="${color}"`)
    .replace(/stroke="(?!none")[^"]*"/gi, `stroke="${color}"`);
}

export function iconifySvgUrl(
  icon: string,
  options?: { size?: number; color?: string }
): string {
  const id = normalizeIconId(icon);
  if (isLobehubIcon(id)) {
    return lobehubSvgUrl(id);
  }
  const slash = id.replace(':', '/');
  const params = new URLSearchParams();
  const size = options?.size ?? 24;
  params.set('width', String(size));
  params.set('height', String(size));
  if (options?.color) {
    params.set('color', options.color);
  }
  const q = params.toString();
  return `${ICONIFY_API}/${slash}.svg${q ? `?${q}` : ''}`;
}

function uniquifySvgIds(svg: string, salt: string): string {
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  let result = svg;
  for (const id of ids) {
    const unique = `${id}-${salt}`;
    result = result.split(id).join(unique);
  }
  return result;
}

export async function fetchIconifySvg(
  icon: string,
  options?: { size?: number; color?: string }
): Promise<string> {
  const id = normalizeIconId(icon);
  if (!id) throw new Error('Icon id is required');

  const size = options?.size ?? 24;
  const color = options?.color ?? '';
  const cacheKey = `${id}|${size}|${color}`;
  const cached = svgCache.get(cacheKey);
  if (cached) return cached;

  const lobehub = isLobehubIcon(id);
  const url = iconifySvgUrl(id, lobehub ? { size } : { size, color: options?.color });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Icon fetch failed (${res.status}): ${id}`);
  }
  let text = sanitizeSvgColors(await res.text());
  if (lobehub) {
    text = uniquifySvgIds(text, cacheKey.replace(/[^a-zA-Z0-9]/g, ''));
    if (options?.color && text.includes('currentColor')) {
      text = text.replace(/currentColor/g, options.color);
    }
  } else if (options?.color) {
    text = applySvgColor(text, options.color);
  }
  svgCache.set(cacheKey, text);
  return text;
}
