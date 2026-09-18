import { AppError, type Direction, type EngineStatus, type NativeTranslator, type NativeTranslatorAPI } from './types';
import { GLOSSARY, preservesFacts, protectTokens } from './glossary';

export const languagePair = (direction: Direction) => direction === 'zh-vi'
  ? { sourceLanguage: 'zh', targetLanguage: 'vi' }
  : { sourceLanguage: 'vi', targetLanguage: 'zh' };

export function getNativeApi(): NativeTranslatorAPI | undefined {
  if (typeof window !== 'undefined' && window.Translator) return window.Translator;
  if (typeof self !== 'undefined' && (self as any).translation) {
    const t = (self as any).translation;
    return {
      async availability(options) {
        if (typeof t.canTranslate === 'function') {
          const res = await t.canTranslate(options);
          if (res === 'readily') return 'available';
          if (res === 'after-download') return 'downloadable';
          if (res === 'no') return 'unavailable';
          return res;
        }
        return 'available';
      },
      async create(options) {
        if (typeof t.createTranslator === 'function') {
          return t.createTranslator(options);
        }
        throw new Error('createTranslator not available');
      },
    };
  }
  if (typeof window !== 'undefined') {
    if (window.Translator) return window.Translator;
    if ((window as any).translation) {
      const t = (window as any).translation;
      return {
        async availability(options) {
          if (typeof t.canTranslate === 'function') {
            const res = await t.canTranslate(options);
            if (res === 'readily') return 'available';
            if (res === 'after-download') return 'downloadable';
            if (res === 'no') return 'unavailable';
            return res;
          }
          return 'available';
        },
        async create(options) {
          if (typeof t.createTranslator === 'function') {
            return t.createTranslator(options);
          }
          throw new Error('createTranslator not available');
        },
      };
    }
  }
  return undefined;
}

export async function fetchTranslateFallback(text: string, direction: Direction): Promise<string> {
  const src = direction === 'zh-vi' ? 'zh-CN' : 'vi';
  const tgt = direction === 'zh-vi' ? 'vi' : 'zh-CN';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${tgt}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Nguồn dịch tạm lỗi (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Kết quả dịch không hợp lệ');
  return (data[0] as Array<[string, ...unknown[]]>).map(item => item[0]).join('');
}

export class TranslationEngine {
  private models = new Map<Direction, Promise<NativeTranslator>>();
  private cache = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private api = getNativeApi, private allowOnline: () => Promise<boolean> = async () => false) {}

  async status(): Promise<EngineStatus[]> {
    const api = this.api();
    return Promise.all((['zh-vi', 'vi-zh'] as Direction[]).map(async direction => {
      if (!api) return { direction, state: 'unsupported' as const };
      try { return { direction, state: await api.availability(languagePair(direction)) }; }
      catch { return { direction, state: 'unavailable' as const }; }
    }));
  }

  /** Invoke directly from a click; downloading requires user activation. */
  initialize(direction: Direction, progress: (value: number) => void = () => {}): Promise<NativeTranslator> {
    const api = this.api();
    if (!api) return Promise.reject(new AppError('UNSUPPORTED', 'Chrome chưa cung cấp bộ dịch trên thiết bị. Kiểm tra Chrome hoặc bật dịch trực tuyến trong Thiết lập nếu bạn muốn.'));
    if (!this.models.has(direction)) {
      const promise = api.create({ ...languagePair(direction), monitor: monitor => {
        monitor.addEventListener('downloadprogress', event => progress((event as Event & { loaded: number }).loaded));
      } });
      this.models.set(direction, promise);
      void promise.catch(() => this.models.delete(direction));
    }
    return this.models.get(direction)!;
  }

  async translate(text: string, direction: Direction): Promise<string> {
    if (!text.trim()) return text;
    if (text.length > 6000) throw new AppError('TOO_LONG', 'Mỗi đoạn tối đa 6.000 ký tự. Hãy chia thành các đoạn ngắn hơn.');
    const direct = direction === 'zh-vi' ? GLOSSARY[text.trim()] : undefined;
    if (direct) return text.replace(text.trim(), direct);
    const online = await this.allowOnline();
    const key = `${online}:${direction}:${text}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const task = this.tail.catch(() => {}).then(async () => {
      let backend: (value: string) => Promise<string>;
      try {
        const api = this.api();
        if (!api) throw new AppError('UNSUPPORTED', 'Bộ dịch trên thiết bị chưa khả dụng. Mở Thiết lập để kiểm tra.');
        if (!this.models.has(direction) && await api.availability(languagePair(direction)) !== 'available') {
          throw new AppError('NEED_SETUP', 'Mở Thiết lập và bấm Khởi tạo để tải bộ dịch cho chiều ngôn ngữ này.');
        }
        let model: NativeTranslator;
        try { model = await this.initialize(direction); }
        catch { throw new AppError('NEED_VISIBLE', 'Chrome cần giao diện đang mở. Hãy mở bảng công cụ và khởi tạo bộ dịch.'); }
        backend = value => model.translate(value);
      } catch (error) {
        if (!online || !await this.allowOnline()) throw error;
        backend = async value => {
          // Recheck consent at dispatch, even if this request was queued earlier.
          if (!await this.allowOnline()) throw new AppError('ONLINE_DISABLED', 'Dịch trực tuyến đã được tắt.');
          return fetchTranslateFallback(value, direction);
        };
      }
      // Give the model the real sentence first. Masking every number harms grammar/context.
      let result = await backend(text);
      if (!result.trim()) throw new Error('Bộ dịch trả về nội dung trống.');
      if (!preservesFacts(text, result, direction)) {
        const shield = protectTokens(text, direction);
        try {
          const shielded = await backend(shield.text);
          result = shield.restore(shielded);
        } catch {
          // If shielded restoration fails, check whether result still preserves facts or throw
        }
        if (!preservesFacts(text, result, direction)) throw new Error('Bản dịch làm thay đổi số liệu hoặc mã hàng. Đã giữ nguyên văn.');
      }
      this.cache.set(key, result);
      if (this.cache.size > 1500) this.cache.delete(this.cache.keys().next().value!);
      return result;
    });
    this.tail = task;
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }

  async translateBatch(texts: string[], direction: Direction): Promise<string[]> {
    if (texts.length > 80 || texts.some(text => typeof text !== 'string' || text.length > 6000)) {
      throw new AppError('TOO_LONG', 'Lô dịch quá lớn. Hãy thử lại.');
    }
    const settled = await Promise.allSettled(texts.map(text => this.translate(text, direction)));
    if (settled.every(s => s.status === 'rejected') && settled.length > 0) {
      throw (settled[0] as PromiseRejectedResult).reason;
    }
    return settled.map((s, i) => s.status === 'fulfilled' ? s.value : texts[i]);
  }
}
