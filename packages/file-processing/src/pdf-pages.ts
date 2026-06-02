import { createCanvas, type Canvas } from '@napi-rs/canvas';

export const PDF_TEXT_SUFFICIENT_CHARS = 80;

const MAX_PAGES = 2;
const MAX_DIMENSION_PX = 960;

export async function extractPdfPageImages(bytes: Buffer): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
    .promise;

  try {
    const urls: string[] = [];
    const pageCount = Math.min(doc.numPages, MAX_PAGES);

    for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(
          1,
          MAX_DIMENSION_PX / Math.max(base.width, 1),
          MAX_DIMENSION_PX / Math.max(base.height, 1)
        );
        const viewport = page.getViewport({ scale });
        const canvas: Canvas = createCanvas(
          Math.max(1, Math.floor(viewport.width)),
          Math.max(1, Math.floor(viewport.height))
        );
        const context = canvas.getContext('2d');

        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        urls.push(`data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`);
      } finally {
        page.cleanup();
      }
    }

    return urls;
  } finally {
    await doc.destroy();
  }
}
