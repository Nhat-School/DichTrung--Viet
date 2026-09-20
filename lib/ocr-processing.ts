import type { OcrLine } from './types';

function otsuThreshold(pixels: Uint8ClampedArray): number {
  const histogram = new Int32Array(256);
  const total = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(.299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2]);
    histogram[gray]++;
  }
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Keep source geometry identical across passes so alternatives can be compared spatially. */
export function prepareOcrCanvases(source: HTMLCanvasElement): HTMLCanvasElement[] {
  const scale = Math.min(3, 2400 / Math.max(source.width, source.height), Math.sqrt(4_000_000 / (source.width * source.height)));
  const normal = document.createElement('canvas');
  normal.width = Math.max(1, Math.round(source.width * scale));
  normal.height = Math.max(1, Math.round(source.height * scale));
  const ctx = normal.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, normal.width, normal.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, normal.width, normal.height);

  // High-contrast binarization with Otsu's thresholding to isolate characters from noisy textures.
  const binarized = document.createElement('canvas');
  binarized.width = normal.width; binarized.height = normal.height;
  const binarizedCtx = binarized.getContext('2d')!;
  const binPixels = ctx.getImageData(0, 0, normal.width, normal.height);
  const thresh = otsuThreshold(binPixels.data);
  for (let i = 0; i < binPixels.data.length; i += 4) {
    const gray = .299 * binPixels.data[i] + .587 * binPixels.data[i + 1] + .114 * binPixels.data[i + 2];
    const v = gray < thresh ? 0 : 255;
    binPixels.data[i] = binPixels.data[i + 1] = binPixels.data[i + 2] = v;
    binPixels.data[i + 3] = 255;
  }
  binarizedCtx.putImageData(binPixels, 0, 0);

  const inverted = document.createElement('canvas');
  inverted.width = normal.width; inverted.height = normal.height;
  const invertedContext = inverted.getContext('2d')!;
  const pixels = ctx.getImageData(0, 0, normal.width, normal.height);
  // White lettering on beige/photographic backgrounds becomes dark, high-contrast text.
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = .299 * pixels.data[i] + .587 * pixels.data[i + 1] + .114 * pixels.data[i + 2];
    const value = Math.max(0, Math.min(255, (255 - gray) * 2));
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  invertedContext.putImageData(pixels, 0, 0);
  return [normal, binarized, inverted];
}

export function cleanOcrText(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/(?<=[\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, '').trim();
}
function useful(line: OcrLine) {
  const text = cleanOcrText(line.text);
  if (!text || !Number.isFinite(line.confidence) || line.confidence < 35) return false;
  if (/^[\s一二丨|/\\_—\-.,·~]+$/.test(text)) return false;
  const han = text.match(/\p{Script=Han}/gu) || [];
  if (han.length >= 2) return true;
  if (han.length === 1 && line.confidence >= 65) return true;
  return /[A-Za-z0-9]{3,}/.test(text) && line.confidence >= 65;
}
function samePosition(a: OcrLine, b: OcrLine): boolean {
  const ar = a.bbox, br = b.bbox;
  const intersection = Math.max(0, Math.min(ar.x1, br.x1) - Math.max(ar.x0, br.x0)) * Math.max(0, Math.min(ar.y1, br.y1) - Math.max(ar.y0, br.y0));
  const smaller = Math.min((ar.x1 - ar.x0) * (ar.y1 - ar.y0), (br.x1 - br.x0) * (br.y1 - br.y0));
  return smaller > 0 && intersection / smaller > .6;
}
export function mergeOcrLines(passes: OcrLine[][]): { text: string; confidence: number; lines: OcrLine[] } {
  const groups: OcrLine[][] = [];
  for (const lines of passes) for (const source of lines) {
    const line = { ...source, text: cleanOcrText(source.text) };
    if (!useful(line)) continue;
    const group = groups.find(items => items.some(item => samePosition(item, line)));
    if (group) group.push(line); else groups.push([line]);
  }
  const lines = groups.map(group => [...group].sort((a, b) => {
    const score = (line: OcrLine) => line.confidence + 5 * (group.filter(other => other.text === line.text).length - 1);
    return score(b) - score(a);
  })[0]).sort((a, b) => {
    const h = Math.min(a.bbox.y1 - a.bbox.y0, b.bbox.y1 - b.bbox.y0);
    return Math.abs(a.bbox.y0 - b.bbox.y0) < h * .5 ? a.bbox.x0 - b.bbox.x0 : a.bbox.y0 - b.bbox.y0;
  });
  const characters = lines.reduce((sum, line) => sum + line.text.length, 0);
  const confidence = characters ? lines.reduce((sum, line) => sum + line.confidence * line.text.length, 0) / characters : 0;
  return { text: lines.map(line => line.text).join('\n'), confidence: Math.round(confidence), lines };
}
