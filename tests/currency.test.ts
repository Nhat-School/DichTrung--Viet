import { describe, it, expect, vi } from 'vitest';
import { convert, validateManualRate, validateRate, loadRate, RATE_TTL } from '../lib/currency';
import type { Rate } from '../lib/types';

describe('currency module', () => {
  describe('validateManualRate', () => {
    it('accepts valid rates and normalizes commas', () => {
      expect(validateManualRate('3870')).toBe('3870');
      expect(validateManualRate('3870.34')).toBe('3870.34');
      expect(validateManualRate('3870,5')).toBe('3870.5');
      expect(validateManualRate('   3900.123456 ')).toBe('3900.123456');
    });

    it('returns empty string for empty or blank input', () => {
      expect(validateManualRate('')).toBe('');
      expect(validateManualRate('   ')).toBe('');
    });

    it('rejects invalid, non-positive, or extreme rates', () => {
      expect(() => validateManualRate('0')).toThrow();
      expect(() => validateManualRate('-100')).toThrow();
      expect(() => validateManualRate('abc')).toThrow();
      expect(() => validateManualRate('3,870.50')).toThrow(); // comma as thousands separator rejected
      expect(() => validateManualRate('1000001')).toThrow();
    });
  });

  describe('convert', () => {
    it('converts CNY to rounded VND with Vietnamese format', () => {
      // 100 CNY * 3850 = 385.000 ₫
      expect(convert('100', '3850')).toBe('385.000 ₫');
      // 12.5 CNY * 3870.34 = 48379.25 -> 48.379 ₫
      expect(convert('12.5', '3870.34')).toBe('48.379 ₫');
      // 0.99 CNY * 3800 = 3762 ₫
      expect(convert('0.99', '3800')).toBe('3.762 ₫');
      // Large amount: 15000 * 3850 = 57.750.000 ₫
      expect(convert('15000', '3850')).toBe('57.750.000 ₫');
    });
  });

  describe('validateRate', () => {
    it('validates a valid Frankfurter API payload', () => {
      const now = Date.parse('2026-09-18T12:00:00Z');
      const payload = { base: 'CNY', quote: 'VND', date: '2026-09-18', rate: '3865.5' };
      const rate = validateRate(payload, now);
      expect(rate.rate).toBe('3865.5');
      expect(rate.date).toBe('2026-09-18');
      expect(rate.source).toBe('Frankfurter');
      expect(rate.stale).toBe(false);
    });

    it('marks old dates as stale (>72 hours)', () => {
      const now = Date.parse('2026-09-18T12:00:00Z');
      const payload = { base: 'CNY', quote: 'VND', date: '2026-09-10', rate: '3865.5' };
      const rate = validateRate(payload, now);
      expect(rate.stale).toBe(true);
    });

    it('rejects invalid base, quote, or future dates', () => {
      const now = Date.parse('2026-09-18T12:00:00Z');
      expect(() => validateRate({ base: 'USD', quote: 'VND', date: '2026-09-18', rate: '25000' }, now)).toThrow();
      expect(() => validateRate({ base: 'CNY', quote: 'VND', date: '2026-10-01', rate: '3800' }, now)).toThrow();
      expect(() => validateRate(null, now)).toThrow();
    });
  });

  describe('loadRate', () => {
    const fixedNow = Date.parse('2026-09-18T12:00:00Z');
    const sampleRate: Rate = {
      rate: '3850',
      date: '2026-09-18',
      fetchedAt: fixedNow - 1000,
      source: 'Frankfurter',
      stale: false,
    };

    it('returns manual rate immediately without network call', async () => {
      const mockFetch = vi.fn();
      const res = await loadRate({ manualRate: '3900', now: fixedNow, fetcher: mockFetch as any });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(res?.rate).toBe('3900');
      expect(res?.source).toBe('manual');
    });

    it('uses cached rate if fetched within TTL', async () => {
      const mockFetch = vi.fn();
      const res = await loadRate({ cached: sampleRate, now: fixedNow + 3600000, fetcher: mockFetch as any });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(res).toBe(sampleRate);
    });

    it('fetches fresh rate when force is true or cache is expired', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ base: 'CNY', quote: 'VND', date: '2026-09-18', rate: '3888' }),
      });
      const res = await loadRate({
        cached: { ...sampleRate, fetchedAt: fixedNow - RATE_TTL - 1000 },
        now: fixedNow,
        fetcher: mockFetch as any,
      });
      expect(mockFetch).toHaveBeenCalled();
      expect(res?.rate).toBe('3888');
    });

    it('falls back to cached rate marked stale when network fails', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      const res = await loadRate({
        cached: { ...sampleRate, fetchedAt: fixedNow - RATE_TTL - 1000 },
        now: fixedNow,
        fetcher: mockFetch as any,
      });
      expect(res?.stale).toBe(true);
      expect(res?.rate).toBe('3850');
      expect(res?.error).toBeDefined();
    });

    it('returns null when network fails and no cached rate exists', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      const res = await loadRate({
        cached: undefined,
        now: fixedNow,
        fetcher: mockFetch as any,
      });
      expect(res).toBeNull();
    });
  });
});
