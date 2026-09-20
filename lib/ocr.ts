import { createWorker, PSM, type Worker } from 'tesseract.js';
import type { Crop, OcrLanguage, OcrLine, OcrResult } from './types';
import { prepareOcrCanvases, mergeOcrLines } from './ocr-processing';

export function cropBounds(crop: Crop | null | undefined, imageWidth: number, imageHeight: number) {
  if (!crop) return { x: 0, y: 0, width: imageWidth, height: imageHeight };
  if (![crop.x, crop.y, crop.width, crop.height, crop.viewportWidth, crop.viewportHeight].every(Number.isFinite)
    || crop.viewportWidth <= 0 || crop.viewportHeight <= 0 || crop.width < 5 || crop.height < 5) {
    throw new Error('Vùng chọn quá nhỏ hoặc không hợp lệ. Hãy khoanh lại.');
  }
  const sx = imageWidth / crop.viewportWidth, sy = imageHeight / crop.viewportHeight;
  const x = Math.max(0, Math.min(imageWidth, Math.round(crop.x * sx)));
  const y = Math.max(0, Math.min(imageHeight, Math.round(crop.y * sy)));
  const width = Math.min(imageWidth, Math.round((crop.x + crop.width) * sx)) - x;
  const height = Math.min(imageHeight, Math.round((crop.y + crop.height) * sy)) - y;
  if (width < 5 || height < 5) throw new Error('Vùng chọn nằm ngoài màn hình.');
  if (width * height > 20_000_000) throw new Error('Vùng ảnh quá lớn. Hãy khoanh sát phần chữ cần đọc.');
  return { x, y, width, height };
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không thể tải ảnh chụp màn hình. Hãy thử lại.'));
    img.src = dataUrl;
  });
}

export class OcrEngine {
  private active?: { id: string; worker: Promise<Worker>; cancelled: boolean };
  async cancel(jobId: string) {
    if (this.active?.id !== jobId) return;
    const task = this.active;
    task.cancelled = true;
    this.active = undefined;
    await (await task.worker).terminate();
  }
  async recognize(image: string, crop: Crop | null, jobId: string, progress: (value: number, status: string) => void, language: OcrLanguage = 'chi_sim'): Promise<OcrResult> {
    if (this.active) await this.cancel(this.active.id);
    const img = await loadImageElement(image);
    const imgWidth = img.naturalWidth || img.width;
    const imgHeight = img.naturalHeight || img.height;
    const rect = cropBounds(crop, imgWidth, imgHeight);
    const canvas = document.createElement('canvas');
    canvas.width = rect.width; canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không thể xử lý ảnh trên canvas.');
    ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    const croppedImage = canvas.toDataURL('image/png');
    let passIndex = -1;
    let lastProgress = 0;
    const report = (value: number, label: string) => {
      lastProgress = Math.max(lastProgress, Math.min(1, value));
      progress(lastProgress, label);
    };
    const task = {
      id: jobId, cancelled: false,
      worker: createWorker([language, 'eng'], 1, {
        workerPath: chrome.runtime.getURL('vendor/tesseract/worker.min.js'),
        corePath: chrome.runtime.getURL('vendor/tesseract-core'),
        langPath: chrome.runtime.getURL('vendor/tessdata-best'),
        workerBlobURL: false,
        cacheMethod: 'none',
        gzip: true,
        logger: message => {
          const p = typeof message.progress === 'number' && !isNaN(message.progress) ? message.progress : 0;
          if (passIndex < 0) report(p * .15, 'Đang khởi tạo bộ nhận diện tiếng Trung');
          else report(.15 + .8 * (passIndex + p) / 2, passIndex === 0 ? 'Đang đọc chữ rải trên ảnh' : 'Đang kiểm tra chữ sáng và tương phản thấp');
        },
      }),
    };
    this.active = task;
    try {
      const worker = await task.worker;
      if (task.cancelled) throw new Error('Đã hủy nhận diện ảnh.');
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: '300' });
      const passes: OcrLine[][] = [];
      const canvases = prepareOcrCanvases(canvas);
      for (passIndex = 0; passIndex < canvases.length; passIndex++) {
        if (task.cancelled) throw new Error('Đã hủy nhận diện ảnh.');
        const prepared = canvases[passIndex];
        const { data } = await worker.recognize(prepared.toDataURL('image/png'), {}, { text: true, blocks: true });
        const scaleX = canvas.width / prepared.width, scaleY = canvas.height / prepared.height;
        passes.push((data.blocks || []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)).map(line => ({
          text: line.text, confidence: line.confidence,
          bbox: { x0: line.bbox.x0 * scaleX, x1: line.bbox.x1 * scaleX, y0: line.bbox.y0 * scaleY, y1: line.bbox.y1 * scaleY },
        })));
      }
      if (task.cancelled) throw new Error('Đã hủy nhận diện ảnh.');
      report(1, 'Đã nhận diện xong');
      return { image: croppedImage, ...mergeOcrLines(passes) };
    } catch (err: any) {
      if (task.cancelled) throw new Error('Đã hủy nhận diện ảnh.');
      throw new Error(`Lỗi nhận diện ảnh: ${err?.message || String(err)}`);
    } finally {
      if (this.active === task) {
        this.active = undefined;
        try { await (await task.worker).terminate(); } catch {}
      }
    }
  }
}
