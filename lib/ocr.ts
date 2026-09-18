import { createWorker, type Worker } from 'tesseract.js';
import type { Crop, OcrResult } from './types';

export function cropBounds(crop: Crop, imageWidth: number, imageHeight: number) {
  if (![crop.x, crop.y, crop.width, crop.height, crop.viewportWidth, crop.viewportHeight].every(Number.isFinite)
    || crop.viewportWidth <= 0 || crop.viewportHeight <= 0 || crop.width < 5 || crop.height < 5) {
    throw new Error('Vùng chọn quá nhỏ hoặc không hợp lệ. Hãy khoanh lại.');
  }
  const sx = imageWidth / crop.viewportWidth, sy = imageHeight / crop.viewportHeight;
  const x = Math.max(0, Math.min(imageWidth, Math.round(crop.x * sx)));
  const y = Math.max(0, Math.min(imageHeight, Math.round(crop.y * sy)));
  const width = Math.min(imageWidth - x, Math.round(crop.width * sx));
  const height = Math.min(imageHeight - y, Math.round(crop.height * sy));
  if (width < 5 || height < 5) throw new Error('Vùng chọn nằm ngoài màn hình.');
  return { x, y, width, height };
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
  async recognize(image: string, crop: Crop, jobId: string, progress: (value: number, status: string) => void): Promise<OcrResult> {
    if (this.active) await this.cancel(this.active.id);
    const bitmap = await createImageBitmap(await (await fetch(image)).blob());
    const rect = cropBounds(crop, bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = rect.width; canvas.height = rect.height;
    canvas.getContext('2d')!.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    bitmap.close();
    const croppedImage = canvas.toDataURL('image/png');
    const task = {
      id: jobId, cancelled: false,
      worker: createWorker(['chi_sim', 'chi_tra', 'eng'], 1, {
        workerPath: chrome.runtime.getURL('vendor/tesseract/worker.min.js'),
        corePath: chrome.runtime.getURL('vendor/tesseract-core'),
        langPath: chrome.runtime.getURL('vendor/tessdata'),
        workerBlobURL: false,
        logger: message => progress(message.progress, message.status),
      }),
    };
    this.active = task;
    try {
      const worker = await task.worker;
      if (task.cancelled) throw new Error('Đã hủy nhận diện ảnh.');
      // Upscale small screenshot crops while preserving the original for comparison.
      const scale = Math.min(2, 2500 / Math.max(canvas.width, canvas.height));
      if (scale > 1) {
        const enlarged = document.createElement('canvas');
        enlarged.width = Math.round(canvas.width * scale); enlarged.height = Math.round(canvas.height * scale);
        enlarged.getContext('2d')!.drawImage(canvas, 0, 0, enlarged.width, enlarged.height);
        const { data } = await worker.recognize(enlarged);
        if (task.cancelled) throw new Error('Đã hủy nhận diện ảnh.');
        return { image: croppedImage, text: data.text.trim(), confidence: data.confidence };
      }
      const { data } = await worker.recognize(canvas);
      if (task.cancelled) throw new Error('Đã hủy nhận diện ảnh.');
      return { image: croppedImage, text: data.text.trim(), confidence: data.confidence };
    } finally {
      if (this.active === task) {
        this.active = undefined;
        await (await task.worker).terminate();
      }
    }
  }
}
