import { describe, it, expect } from 'vitest';
import { cropBounds } from '../lib/ocr';
import type { Crop } from '../lib/types';

describe('ocr module cropBounds', () => {
  it('clips negative drag coordinates without widening the selection', () => {
    expect(cropBounds({ x: -20, y: -10, width: 100, height: 60, viewportWidth: 1000, viewportHeight: 800 }, 2000, 1600))
      .toEqual({ x: 0, y: 0, width: 160, height: 100 });
  });
  it('scales coordinates correctly for standard 1x displays', () => {
    const crop: Crop = {
      x: 100,
      y: 200,
      width: 300,
      height: 150,
      viewportWidth: 1000,
      viewportHeight: 800,
    };
    const bounds = cropBounds(crop, 1000, 800);
    expect(bounds).toEqual({ x: 100, y: 200, width: 300, height: 150 });
  });

  it('scales coordinates accurately for Retina 2x screenshot displays', () => {
    const crop: Crop = {
      x: 100,
      y: 150,
      width: 200,
      height: 100,
      viewportWidth: 1000,
      viewportHeight: 800,
    };
    // Image is 2000x1600 (devicePixelRatio = 2)
    const bounds = cropBounds(crop, 2000, 1600);
    expect(bounds).toEqual({ x: 200, y: 300, width: 400, height: 200 });
  });

  it('clamps bounds to image dimensions when selection exceeds boundary', () => {
    const crop: Crop = {
      x: 800,
      y: 600,
      width: 400,
      height: 400,
      viewportWidth: 1000,
      viewportHeight: 800,
    };
    const bounds = cropBounds(crop, 1000, 800);
    expect(bounds.x).toBe(800);
    expect(bounds.y).toBe(600);
    expect(bounds.width).toBe(200); // 1000 - 800
    expect(bounds.height).toBe(200); // 800 - 600
  });

  it('throws when selection is too small (<5px)', () => {
    const tinyCrop: Crop = {
      x: 10,
      y: 10,
      width: 3,
      height: 3,
      viewportWidth: 1000,
      viewportHeight: 800,
    };
    expect(() => cropBounds(tinyCrop, 1000, 800)).toThrow('Vùng chọn quá nhỏ');
  });

  it('throws on non-finite coordinates or zero viewport', () => {
    const invalidCrop: Crop = {
      x: NaN,
      y: 0,
      width: 100,
      height: 100,
      viewportWidth: 1000,
      viewportHeight: 800,
    };
    expect(() => cropBounds(invalidCrop, 1000, 800)).toThrow();
  });
});
