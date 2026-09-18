import { expect, it } from 'vitest';
import { splitText } from '../lib/text-chunks';
it('preserves long article text including punctuation, spaces and surrogate pairs', () => {
  const text = '今天的新闻。\n价格保持不变。🙂 '.repeat(1000);
  const chunks = splitText(text);
  expect(chunks.join('')).toBe(text);
  expect(chunks.every(chunk => chunk.length <= 1800)).toBe(true);
  expect(chunks.some(chunk => /[\uD800-\uDBFF]$/.test(chunk))).toBe(false);
});
