import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranslationEngine } from '../lib/translator';
import { preservesFacts } from '../lib/glossary';
import type { NativeTranslatorAPI } from '../lib/types';

afterEach(() => vi.unstubAllGlobals());
const api = (translate: (text: string) => Promise<string>): NativeTranslatorAPI => ({
  availability: async () => 'available', create: async () => ({ translate, destroy() {} }),
});
describe('translation quality and truthful failures', () => {
  it('does not claim a missing local translator is available', async () => {
    const engine = new TranslationEngine(() => undefined);
    expect((await engine.status()).every(item => item.state === 'unsupported')).toBe(true);
    await expect(engine.initialize('zh-vi')).rejects.toThrow('chưa cung cấp');
  });
  it('never sends text online without explicit opt-in, including batch failures', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const engine = new TranslationEngine(() => undefined);
    await expect(engine.translate('今天的新闻', 'zh-vi')).rejects.toThrow('chưa khả dụng');
    await expect(engine.translateBatch(['新闻内容', '其他内容'], 'zh-vi')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses natural sentences first and preserves numeric facts', async () => {
    const translate = vi.fn(async (text: string) => text === '长度10cm' ? 'Dài 10cm' : 'Giảm xóc 6 lớp');
    const engine = new TranslationEngine(() => api(translate));
    expect(await engine.translate('长度10cm', 'zh-vi')).toBe('Dài 10cm');
    expect(translate).toHaveBeenCalledWith('长度10cm');
    expect(await engine.translate('六重减震', 'zh-vi')).toBe('Giảm xóc 6 lớp');
    expect(preservesFacts('10cm, 50件', '20cm, 50 cái', 'zh-vi')).toBe(false);
  });
  it('retries with shields only when the fluent result changes a number', async () => {
    const translate = vi.fn(async (text: string) => text.includes('ZXQ') ? text.replace('数量', 'Số lượng').replace('件', 'cái') : 'Số lượng 90 cái');
    const engine = new TranslationEngine(() => api(translate));
    expect(await engine.translate('数量50件', 'zh-vi')).toBe('Số lượng50cái');
    expect(translate).toHaveBeenCalledTimes(2);
  });
  it('does not merge unrelated lines or silently count errors as successes', async () => {
    const translate = vi.fn(async (text: string) => text === '第一段' ? 'Đoạn đầu' : 'Đoạn sau');
    const engine = new TranslationEngine(() => api(translate));
    expect(await engine.translateBatch(['第一段', '第二段'], 'zh-vi')).toEqual(['Đoạn đầu', 'Đoạn sau']);
    expect(translate.mock.calls.every(([text]) => !text.includes('\n'))).toBe(true);
  });
  it('gracefully isolates individual item errors in translateBatch without failing whole batch', async () => {
    // First item preserves numbers (valid), second item returns mismatched numbers (fails fact preservation)
    const translate = vi.fn(async (text: string) => {
      if (text === '50件衣服') return '50 bộ quần áo';
      if (text === '100个零件') return '99 linh kiện'; // Mismatched numbers!
      return text;
    });
    const engine = new TranslationEngine(() => api(translate));
    const results = await engine.translateBatch(['50件衣服', '100个零件'], 'zh-vi');
    expect(results[0]).toBe('50 bộ quần áo');
    // Failed item falls back to original text
    expect(results[1]).toBe('100个零件');
  });
  it('checks online consent again when dispatching queued text', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => [[['Bản dịch', '原文']]] }));
    vi.stubGlobal('fetch', fetch);
    const consent = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    const engine = new TranslationEngine(() => undefined, consent);
    await expect(engine.translate('原文', 'zh-vi')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
