import { describe, it, expect } from 'vitest';
import { parsePrices, formatPrice } from '../lib/prices';

describe('prices module', () => {
  describe('parsePrices with explicit currency symbols', () => {
    it('parses single price with ¥ symbol', () => {
      const res = parsePrices('¥99.00');
      expect(res).toHaveLength(1);
      expect(res[0].amounts).toEqual(['99']);
    });

    it('parses fullwidth ￥ symbol and space', () => {
      const res = parsePrices('￥ 128.50');
      expect(res).toHaveLength(1);
      expect(res[0].amounts).toEqual(['128.5']);
    });

    it('parses price with 元 suffix', () => {
      const res = parsePrices('特价 45.00元');
      expect(res).toHaveLength(1);
      expect(res[0].amounts).toEqual(['45']);
    });

    it('parses CNY and RMB prefixes', () => {
      const cny = parsePrices('CNY 299');
      expect(cny).toHaveLength(1);
      expect(cny[0].amounts).toEqual(['299']);

      const rmb = parsePrices('RMB 150.00');
      expect(rmb).toHaveLength(1);
      expect(rmb[0].amounts).toEqual(['150']);
    });

    it('parses price ranges with various hyphens and tildes', () => {
      const dash = parsePrices('¥19.90 - 39.90');
      expect(dash).toHaveLength(1);
      expect(dash[0].amounts).toEqual(['19.9', '39.9']);

      const tilde = parsePrices('￥50.00～100.00');
      expect(tilde).toHaveLength(1);
      expect(tilde[0].amounts).toEqual(['50', '100']);

      const doubleSymbol = parsePrices('¥15.00~¥25.00');
      expect(doubleSymbol).toHaveLength(1);
      expect(doubleSymbol[0].amounts).toEqual(['15', '25']);

      const chineseZhi = parsePrices('10至20元');
      expect(chineseZhi).toHaveLength(1);
      expect(chineseZhi[0].amounts).toEqual(['10', '20']);
    });

    it('parses numbers with 万 (10,000) multiplier', () => {
      const res = parsePrices('¥1.5万');
      expect(res).toHaveLength(1);
      expect(res[0].amounts).toEqual(['15000']);
    });

    it('parses tiered prices in wholesale context', () => {
      const res = parsePrices('起批量 ≥2件 ¥58.00, ≥10件 ¥48.00');
      expect(res).toHaveLength(2);
      expect(res[0].amounts).toEqual(['58']);
      expect(res[1].amounts).toEqual(['48']);
    });

    it('parses shipping fee with explicit currency', () => {
      const res = parsePrices('快递: 8.00元 (偏远地区除外)');
      expect(res).toHaveLength(1);
      expect(res[0].amounts).toEqual(['8']);
    });
  });

  describe('parsePrices bare mode and exclusions', () => {
    it('parses bare price only when allowBare is true', () => {
      expect(parsePrices('99.00', false)).toHaveLength(0);
      const bare = parsePrices('99.00', true);
      expect(bare).toHaveLength(1);
      expect(bare[0].amounts).toEqual(['99']);
    });

    it('parses bare price with unit suffix when allowBare is true', () => {
      const bareUnit = parsePrices('35.50 /件', true);
      expect(bareUnit).toHaveLength(1);
      expect(bareUnit[0].amounts).toEqual(['35.5']);

      const bareQi = parsePrices('49.90 起批', true);
      expect(bareQi).toHaveLength(1);
      expect(bareQi[0].amounts).toEqual(['49.9']);
    });

    it('does NOT parse non-currency numbers as prices', () => {
      expect(parsePrices('已售 5000 件')).toHaveLength(0);
      expect(parsePrices('库存 1000')).toHaveLength(0);
      expect(parsePrices('商品评分 4.9 分')).toHaveLength(0);
      expect(parsePrices('材质: 100% 纯棉')).toHaveLength(0);
      expect(parsePrices('货号: AB-9021')).toHaveLength(0);
      expect(parsePrices('月销 2000+')).toHaveLength(0);
      expect(parsePrices('48小时内发货')).toHaveLength(0);
    });

    it('ignores Japanese Yen prices', () => {
      expect(parsePrices('2500円')).toHaveLength(0);
      expect(parsePrices('JPY 3000')).toHaveLength(0);
      expect(parsePrices('日元 5000')).toHaveLength(0);
    });
  });

  describe('formatPrice', () => {
    const rate = '3850';

    it('formats single price into Vietnamese Dong', () => {
      const single = { raw: '¥100', amounts: ['100'] };
      expect(formatPrice(single, rate)).toBe('≈ 385.000 ₫');
      expect(formatPrice(single, rate, true)).toBe('385.000 ₫');
    });

    it('formats price range into Vietnamese Dong range', () => {
      const range = { raw: '¥10-20', amounts: ['10', '20'] };
      expect(formatPrice(range, rate)).toBe('≈ 38.500 ₫ – 77.000 ₫');
      expect(formatPrice(range, rate, true)).toBe('38.500 ₫ – 77.000 ₫');
    });
  });
});
