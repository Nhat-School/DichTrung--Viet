import { describe, it, expect } from 'vitest';
import { GLOSSARY, hasChinese, preservesFacts, protectTokens } from '../lib/glossary';

describe('glossary module', () => {
  it('has essential shopping terms mapped accurately', () => {
    expect(GLOSSARY['起批量']).toBe('Số lượng đặt tối thiểu');
    expect(GLOSSARY['阶梯价']).toBe('Giá theo số lượng');
    expect(GLOSSARY['包邮']).toBe('Miễn phí vận chuyển');
    expect(GLOSSARY['不包邮']).toBe('Không miễn phí vận chuyển');
    expect(GLOSSARY['现货']).toBe('Hàng có sẵn');
    expect(GLOSSARY['预售']).toBe('Đặt trước');
    expect(GLOSSARY['七天无理由退货']).toBe('Trả hàng trong 7 ngày không cần lý do');
    expect(GLOSSARY['颜色分类']).toBe('Phân loại màu');
    expect(GLOSSARY['立即购买']).toBe('Mua ngay');
  });

  it('detects Chinese characters with hasChinese', () => {
    expect(hasChinese('你好')).toBe(true);
    expect(hasChinese('券后价 ¥100')).toBe(true);
    expect(hasChinese('Hello world')).toBe(false);
    expect(hasChinese('12345.67')).toBe(false);
    expect(hasChinese('₫ 38.500')).toBe(false);
  });

  describe('preservesFacts', () => {
    it('handles case differences and spacing in product models and units', () => {
      expect(preservesFacts('大公牛防震200CC自动挡沙', 'Xe cát số tự động 200cc giảm xóc Bull', 'zh-vi')).toBe(true);
      expect(preservesFacts('49cc汽油四轮摩托车', 'Xe máy 4 bánh 49 cc chạy xăng', 'zh-vi')).toBe(true);
      expect(preservesFacts('49cc汽油四轮摩托车', 'Xe máy 4 bánh 49 phân khối chạy xăng', 'zh-vi')).toBe(true);
      expect(preservesFacts('60v5600w无刷电机', 'Động cơ không chổi than 60V 5600W', 'zh-vi')).toBe(true);
      expect(preservesFacts('Valtinsu Em5-pro电动摩托车', 'Xe máy điện Valtinsu Em5 - pro', 'zh-vi')).toBe(true);
      expect(preservesFacts('LC135260浮动盘', 'Đĩa phanh nổi lc135260', 'zh-vi')).toBe(true);
      // Mismatched numbers must still fail
      expect(preservesFacts('200CC摩托车', 'Xe máy 150cc', 'zh-vi')).toBe(false);
    });
  });

  describe('protectTokens', () => {
    it('protects numbers, percentages, URLs, and alphanumeric codes in zh-vi', () => {
      const input = '优惠 20%, 货号 ABC-12345, 满 300 减 40, 链接 https://example.com/item';
      const shield = protectTokens(input, 'zh-vi');
      expect(shield.text).not.toContain('ABC-12345');
      expect(shield.text).not.toContain('20%');
      expect(shield.text).not.toContain('https://example.com/item');

      // Simulate a translation that keeps the token placeholders intact
      const simulatedTranslation = shield.text
        .replace('优惠', 'Giảm giá')
        .replace('货号', 'Mã hàng')
        .replace('满', 'Đủ')
        .replace('减', 'giảm')
        .replace('链接', 'Đường dẫn');

      const restored = shield.restore(simulatedTranslation);
      expect(restored).toContain('20%');
      expect(restored).toContain('ABC-12345');
      expect(restored).toContain('300');
      expect(restored).toContain('40');
      expect(restored).toContain('https://example.com/item');
    });

    it('handles casing and spacing differences in engine output for placeholders', () => {
      const input = '49cc 摩托车 200CC';
      const shield = protectTokens(input, 'zh-vi');
      // Translation engine returned lowercase or spaced placeholders
      const engineOutput = 'zxq0qxz zxq1qxz xe máy ZXQ 2 QXZ zxq 3 qxz';
      const restored = shield.restore(engineOutput);
      expect(restored).toBe('49 cc xe máy 200 CC');
    });

    it('protects SKU codes and quantities in vi-zh without breaking normal Vietnamese words', () => {
      const input = 'Tôi muốn đặt 50 chiếc mẫu A123-X và 20 chiếc mã B999';
      const shield = protectTokens(input, 'vi-zh');
      expect(shield.text).toContain('Tôi muốn đặt'); // Vietnamese words preserved
      expect(shield.text).not.toContain('A123-X');
      expect(shield.text).not.toContain('B999');

      const restored = shield.restore(shield.text);
      expect(restored).toBe(input);
    });

    it('throws when model corrupts or drops the token placeholders', () => {
      const input = '数量 50 件, 价格 ¥100';
      const shield = protectTokens(input, 'zh-vi');
      // Simulated translation that accidentally erased a placeholder
      const brokenTranslation = 'Số lượng cái, giá tiền';
      expect(() => shield.restore(brokenTranslation)).toThrow('Bản dịch làm thay đổi số liệu hoặc mã hàng');
    });
  });
});
