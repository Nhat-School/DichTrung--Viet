import { describe, it, expect } from 'vitest';
import { resolveCaptchaPrompt } from '../lib/captcha-matcher';

describe('resolveCaptchaPrompt', () => {
  it('correctly resolves noisy surveillance camera challenge', () => {
    const res1 = resolveCaptchaPrompt('只 竹 1 个 监控 这 如 半');
    expect(res1).not.toBeNull();
    expect(res1?.vi).toBe('Chỉ có 1 camera giám sát');

    const res2 = resolveCaptchaPrompt('只 和 :不 售 控 插 搜 次');
    expect(res2).not.toBeNull();
    expect(res2?.vi).toBe('Chỉ có 1 camera giám sát');

    const res3 = resolveCaptchaPrompt('只有1个监控摄像头');
    expect(res3?.vi).toBe('Chỉ có 1 camera giám sát');
  });

  it('correctly resolves fire extinguisher challenge', () => {
    const res = resolveCaptchaPrompt('只有1个灭火器');
    expect(res?.vi).toBe('Chỉ có 1 bình chữa cháy');
  });

  it('correctly resolves people count challenge', () => {
    const res = resolveCaptchaPrompt('有六个人');
    expect(res?.vi).toBe('Có 6 người');
  });

  it('correctly resolves square switch challenge', () => {
    const res = resolveCaptchaPrompt('正好4个方形开关');
    expect(res?.vi).toBe('Đúng 4 công tắc vuông');
  });

  it('resolves objects without quantity prefix', () => {
    expect(resolveCaptchaPrompt('灭火器')?.vi).toBe('Bình chữa cháy');
    expect(resolveCaptchaPrompt('消火栓')?.vi).toBe('Trụ cứu hỏa');
    expect(resolveCaptchaPrompt('红绿灯')?.vi).toBe('Đèn giao thông');
  });
});
