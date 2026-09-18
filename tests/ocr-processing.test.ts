import { describe, it, expect } from 'vitest';
import { mergeOcrLines } from '../lib/ocr-processing';
import type { OcrLine } from '../lib/types';
const line = (text: string, confidence: number, y: number, x = 0): OcrLine => ({ text, confidence, bbox: { x0: x, y0: y, x1: x + 100, y1: y + 20 } });
describe('OCR multi-pass assembly', () => {
  it('merges duplicate positions while preserving repeated text elsewhere', () => {
    const result = mergeOcrLines([[line('白 色', 60, 0), line('现货', 80, 50)], [line('白色', 94, 0), line('现货', 90, 50), line('现货', 90, 100)]]);
    expect(result.text).toBe('白色\n现货\n现货');
    expect(result.lines).toHaveLength(3);
  });
  it('drops graphic strokes and garbage without declaring an empty image successful', () => {
    expect(mergeOcrLines([[line('一一一', 95, 0), line('/', 92, 20), line('ll', 20, 40)]]))
      .toEqual({ text: '', confidence: 0, lines: [] });
  });
  it('keeps low-confidence Chinese for review and reads two columns in order', () => {
    const result = mergeOcrLines([[line('六重减震', 92, 20, 0), line('双层餐盘', 55, 20, 200), line('加大车棚', 90, 70)]]);
    expect(result.text).toBe('六重减震\n双层餐盘\n加大车棚');
    expect(result.lines[1].confidence).toBe(55);
  });
});
