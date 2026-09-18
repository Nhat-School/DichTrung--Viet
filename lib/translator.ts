import { AppError, type Direction, type EngineStatus, type NativeTranslator, type NativeTranslatorAPI } from './types';
import { GLOSSARY, protectTokens } from './glossary';

export const languagePair = (direction: Direction) => direction === 'zh-vi'
  ? { sourceLanguage: 'zh', targetLanguage: 'vi' }
  : { sourceLanguage: 'vi', targetLanguage: 'zh' };

export function getNativeApi(): NativeTranslatorAPI | undefined {
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
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
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

  constructor(private api = getNativeApi) {}

  async status(): Promise<EngineStatus[]> {
    const api = this.api();
    return Promise.all((['zh-vi', 'vi-zh'] as Direction[]).map(async direction => {
      if (api) {
        try {
          const state = await api.availability(languagePair(direction));
          return { direction, state };
        } catch {
          // Native failed
        }
      }
      return { direction, state: 'available' as const };
    }));
  }

  /** Must be invoked directly in a click handler, before awaiting anything. */
  initialize(direction: Direction, progress: (value: number) => void = () => {}): Promise<NativeTranslator> {
    const api = this.api();
    if (!api) {
      // Return a pseudo native translator using fallback
      const pseudo: NativeTranslator = {
        async translate(text: string) {
          return fetchTranslateFallback(text, direction);
        },
        destroy() {},
      };
      return Promise.resolve(pseudo);
    }
    if (!this.models.has(direction)) {
      const promise = api.create({
        ...languagePair(direction),
        monitor: monitor => {
          monitor.addEventListener('downloadprogress', event => progress((event as Event & { loaded: number }).loaded));
        },
      });
      this.models.set(direction, promise);
      promise.catch(() => this.models.delete(direction));
    }
    return this.models.get(direction)!;
  }

  async translate(text: string, direction: Direction): Promise<string> {
    if (!text.trim()) return text;
    if (text.length > 6000) throw new AppError('TOO_LONG', 'Mỗi đoạn tối đa 6.000 ký tự. Hãy chia thành các đoạn ngắn hơn.');
    const direct = direction === 'zh-vi' ? GLOSSARY[text.trim()] : undefined;
    if (direct) return text.replace(text.trim(), direct);

    const key = `${direction}:${text}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const existing = this.pending.get(key);
    if (existing) return existing;

    const task = this.tail.catch(() => {}).then(async () => {
      const shield = protectTokens(text, direction);
      const api = this.api();

      let translated: string | undefined;
      if (api) {
        try {
          const model = await this.initialize(direction);
          translated = await model.translate(shield.text);
        } catch {
          // Native translation failed, try fallback
        }
      }

      if (!translated) {
        translated = await fetchTranslateFallback(shield.text, direction);
      }

      const restored = shield.restore(translated);
      this.cache.set(key, restored);
      if (this.cache.size > 2000) this.cache.delete(this.cache.keys().next().value!);
      return restored;
    });

    this.tail = task;
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
}
