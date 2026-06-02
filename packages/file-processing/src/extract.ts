import {
  isDocx,
  isImageMime,
  isLegacyDoc,
  isPptx,
  isSpreadsheet,
  isTextLike,
  normalizeMimeType,
  sniffMimeFromBytes,
} from './mime';
import {
  extractPdfPageImages,
  PDF_TEXT_SUFFICIENT_CHARS,
} from './pdf-pages';

export const TEXT_EXCERPT_MAX = 12_000;

export type ExtractResult = {
  textExcerpt?: string;
  note?: string;
  imageDataUrl?: string;
  embeddedImageDataUrls?: string[];
  kind: 'image' | 'file';
};

export type ExtractOptions = {
  maxImageBytesForLlm?: number;
  includeImageDataUrl?: boolean;
};

async function extractDocxText(bytes: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: bytes });
  return (result.value ?? '').trim();
}

const DOCX_MEDIA_RE = /^word\/media\/.+\.(png|jpe?g|gif|webp|bmp)$/i;

async function extractDocxEmbeddedImages(bytes: Buffer): Promise<string[]> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const urls: string[] = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !DOCX_MEDIA_RE.test(path)) continue;
    const ext = path.split('.').pop()?.toLowerCase() ?? 'png';
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'png'
          ? 'image/png'
          : ext === 'gif'
            ? 'image/gif'
            : ext === 'webp'
              ? 'image/webp'
              : ext === 'bmp'
                ? 'image/bmp'
                : `image/${ext}`;
    const data = await entry.async('nodebuffer');
    if (data.length === 0) continue;
    urls.push(`data:${mime};base64,${data.toString('base64')}`);
  }

  return urls;
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: bytes });
  const parsed = await parser.getText();
  await parser.destroy();
  return (parsed.text ?? '').trim();
}

function attachVisionUrls(
  base: Omit<ExtractResult, 'imageDataUrl' | 'embeddedImageDataUrls'>,
  urls: string[]
): ExtractResult {
  if (!urls.length) return base;
  return {
    ...base,
    imageDataUrl: urls[0],
    embeddedImageDataUrls: urls.length > 1 ? urls.slice(1) : undefined,
  };
}

async function extractPptxText(bytes: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const parts: string[] = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/^ppt\/slides\/slide\d+\.xml$/i.test(path)) continue;
    const xml = await entry.async('string');
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map(
      (match) => match[1]?.trim() ?? ''
    );
    const slideText = texts.filter(Boolean).join(' ').trim();
    if (slideText) parts.push(slideText);
  }

  return parts.join('\n\n');
}

async function extractSpreadsheetText(bytes: Buffer): Promise<string> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(bytes, { type: 'buffer' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) {
      parts.push(`[Sheet: ${sheetName}]\n${csv}`);
    }
  }
  return parts.join('\n\n');
}

export async function extractFileContent(
  bytes: Buffer,
  mimeType: string,
  filename: string,
  options: ExtractOptions = {}
): Promise<ExtractResult> {
  let mime = normalizeMimeType(mimeType, filename);
  if (mime === 'application/octet-stream') {
    const sniffed = sniffMimeFromBytes(bytes);
    if (sniffed) mime = normalizeMimeType(sniffed, filename);
  }
  const kind = isImageMime(mime) ? 'image' : 'file';
  const maxImage = options.maxImageBytesForLlm ?? 6 * 1024 * 1024;
  const includeImage = options.includeImageDataUrl !== false;

  if (kind === 'image') {
    if (!includeImage) {
      return {
        kind,
        note: `Image ${filename} (analysis from registry; live vision only when required).`,
      };
    }
    if (bytes.length > maxImage) {
      return {
        kind,
        note: `Image ${filename} is too large for analysis (${Math.round(bytes.length / (1024 * 1024))} MB). Please use an image under ${Math.round(maxImage / (1024 * 1024))} MB.`,
      };
    }
    const b64 = bytes.toString('base64');
    return {
      kind,
      imageDataUrl: `data:${mime};base64,${b64}`,
    };
  }

  if (isLegacyDoc(filename)) {
    return {
      kind,
      note: `Legacy Word .doc format is not supported for ${filename}. Please save as .docx and re-upload.`,
    };
  }

  if (isDocx(mime, filename)) {
    try {
      const [text, embedded] = await Promise.all([
        extractDocxText(bytes),
        extractDocxEmbeddedImages(bytes).catch(() => [] as string[]),
      ]);

      if (text) {
        return attachVisionUrls(
          { kind, textExcerpt: text.slice(0, TEXT_EXCERPT_MAX) },
          embedded
        );
      }
      if (embedded.length > 0) {
        return attachVisionUrls(
          {
            kind,
            textExcerpt: `Word document ${filename}: ${embedded.length} embedded image(s).`,
          },
          embedded
        );
      }
      return { kind, note: `Word document ${filename} has no extractable text or images.` };
    } catch {
      return {
        kind,
        note: `Word document attached (${filename}) but text extraction failed.`,
      };
    }
  }

  if (isPptx(mime, filename)) {
    try {
      const text = await extractPptxText(bytes);
      if (!text.trim()) {
        return { kind, note: `Presentation ${filename} has no extractable slide text.` };
      }
      return { kind, textExcerpt: text.slice(0, TEXT_EXCERPT_MAX) };
    } catch {
      return {
        kind,
        note: `Presentation attached (${filename}) but text extraction failed.`,
      };
    }
  }

  if (isSpreadsheet(mime, filename)) {
    try {
      const text = await extractSpreadsheetText(bytes);
      if (!text.trim()) {
        return { kind, note: `Spreadsheet ${filename} has no extractable data.` };
      }
      return { kind, textExcerpt: text.slice(0, TEXT_EXCERPT_MAX) };
    } catch {
      return {
        kind,
        note: `Spreadsheet attached (${filename}) but extraction failed.`,
      };
    }
  }

  if (isTextLike(mime, filename)) {
    const text = bytes.toString('utf8');
    return { kind, textExcerpt: text.slice(0, TEXT_EXCERPT_MAX) };
  }

  if (mime === 'application/pdf') {
    let text = '';
    try {
      text = await extractPdfText(bytes);
    } catch {
      /* fall through to page render */
    }

    const trimmed = text.trim();
    const pageImages =
      trimmed.length >= PDF_TEXT_SUFFICIENT_CHARS
        ? []
        : await extractPdfPageImages(bytes).catch(() => [] as string[]);

    if (trimmed) {
      return attachVisionUrls(
        { kind, textExcerpt: trimmed.slice(0, TEXT_EXCERPT_MAX) },
        pageImages
      );
    }
    if (pageImages.length > 0) {
      return attachVisionUrls(
        {
          kind,
          textExcerpt: `PDF ${filename}: ${pageImages.length} page(s) for visual analysis.`,
        },
        pageImages
      );
    }
    return {
      kind,
      note: `PDF attached (${filename}) but no text or renderable pages were found.`,
    };
  }

  return {
    kind,
    note: `Binary file attached: ${filename} (${mime}).`,
  };
}

export function extractToSummary(text: string, maxLen = 500): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}
