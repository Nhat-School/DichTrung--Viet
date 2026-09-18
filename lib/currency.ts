import Decimal from 'decimal.js';
import type { Rate } from './types';

export const RATE_TTL = 6 * 60 * 60 * 1000;
export const RATE_URL = 'https://api.frankfurter.dev/v2/rate/CNY/VND';
export function validateManualRate(value: string): string {
  if (!value.trim()) return '';
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized) || !new Decimal(normalized).gt(0) || new Decimal(normalized).gt(1000000)) {
    throw new Error('Nhập số VNĐ cho 1 CNY, ví dụ 3870.34 (không dùng dấu phân cách hàng nghìn).');
  }
  return new Decimal(normalized).toString();
}
export function convert(amount: string, rate: string): string {
  return new Decimal(amount).mul(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';
}
export function validateRate(data: unknown, now = Date.now()): Rate {
  const d = data as Record<string, unknown>;
  if (!d || d.base !== 'CNY' || d.quote !== 'VND' || typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('Nguồn tỷ giá trả về dữ liệu không hợp lệ.');
  const date = Date.parse(d.date);
  if (!Number.isFinite(date) || date > now + 86400000 || new Date(date).toISOString().slice(0, 10) !== d.date) throw new Error('Ngày tỷ giá không hợp lệ.');
  const rate = validateManualRate(String(d.rate));
  if (!rate) throw new Error('Nguồn chưa có tỷ giá.');
  return { rate, date: d.date, fetchedAt: now, source: 'Frankfurter', stale: now - date > 72 * 3600000 };
}

export async function loadRate(options: {
  cached?: Rate; manualRate?: string; force?: boolean; now?: number;
  fetcher?: typeof fetch;
}): Promise<Rate | null> {
  const { cached, manualRate, force, now = Date.now(), fetcher = fetch } = options;
  if (manualRate) return { rate: validateManualRate(manualRate), date: '', fetchedAt: now, source: 'manual', stale: false };
  if (!force && cached && now - cached.fetchedAt < RATE_TTL) return cached;
  try {
    const response = await fetcher(RATE_URL, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Nguồn tỷ giá tạm lỗi (${response.status}).`);
    return validateRate(await response.json(), now);
  } catch (error) {
    if (!cached) return null;
    return { ...cached, stale: true, error: 'Chưa cập nhật được. Đang dùng tỷ giá đã lưu.' };
  }
}
