import { AppError, type Direction, type EngineStatus, type NativeTranslator, type NativeTranslatorAPI } from './types';
import { GLOSSARY, protectTokens } from './glossary';

export const languagePair = (direction: Direction) => direction === 'zh-vi'
  ? { sourceLanguage: 'zh', targetLanguage: 'vi' }
  : { sourceLanguage: 'vi', targetLanguage: 'zh' };

export class TranslationEngine {
  private models = new Map<Direction, Promise<NativeTranslator>>();
  private cache = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private api = (): NativeTranslatorAPI | undefined => window.Translator) {}

  async status(): Promise<EngineStatus[]> {
    return Promise.all((['zh-vi', 'vi-zh'] as Direction[]).map(async direction => ({
      direction,
      state: this.api() ? await this.api()!.availability(languagePair(direction)) : 'unsupported' as const,
    })));
  }

  /** Must be invoked directly in a click handler, before awaiting anything. */
  initialize(direction: Direction, progress: (value: number) => void = () => {}): Promise<NativeTranslator> {
    const api = this.api();
    if (!api) return Promise.reject(new AppError('UNSUPPORTED', 'Chrome chưa cung cấp bộ dịch trên thiết bị. Hãy dùng Chrome bản mới và kiểm tra chính sách quản lý trình duyệt.'));
    if (!this.models.has(direction)) {
      const promise = api.create({ ...languagePair(direction), monitor: monitor => {
        monitor.addEventListener('downloadprogress', event => progress((event as Event & { loaded: number }).loaded));
      } });
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
      const api = this.api();
      if (!api) throw new AppError('UNSUPPORTED', 'Bộ dịch trên thiết bị chưa khả dụng. Mở Thiết lập để kiểm tra.');
      if (!this.models.has(direction)) {
        const state = await api.availability(languagePair(direction));
        if (state !== 'available') throw new AppError('NEED_SETUP', 'Mở Thiết lập và bấm tải bộ dịch cho chiều ngôn ngữ này.');
      }
      let model: NativeTranslator;
      try { model = await this.initialize(direction); }
      catch { throw new AppError('NEED_VISIBLE', 'Chrome cần giao diện dịch đang mở. Hãy mở bảng công cụ và khởi tạo bộ dịch.'); }
      const shield = protectTokens(text, direction);
      const translated = await model.translate(shield.text);
      const restored = shield.restore(translated);
      this.cache.set(key, restored);
      if (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value!);
      return restored;
    });
    this.tail = task;
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }
}
