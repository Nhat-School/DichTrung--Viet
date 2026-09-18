import { describe, it, expect } from 'vitest';
import { isCommerceSite, siteFor, sitePattern } from '../lib/types';
describe('generic site scope', () => {
  it('supports ordinary Chinese websites without treating every domain as a shop', () => {
    expect(siteFor('https://news.example.com/article?id=2')).toBe('https://news.example.com');
    expect(sitePattern('https://news.example.com')).toBe('https://news.example.com/*');
    expect(isCommerceSite('https://news.example.com')).toBe(false);
  });
  it('keeps commerce adapters and rejects lookalike URLs', () => {
    expect(siteFor('https://detail.1688.com/a')).toBe('1688');
    expect(siteFor('http://item.taobao.com/a')).toBe('taobao');
    expect(siteFor('https://taobao.com.example.org/a')).toBe('https://taobao.com.example.org');
  });
  it('does not request privileged schemes or a wildcard for an ordinary site', () => {
    for (const url of ['chrome://settings', 'file:///tmp/a', 'javascript:alert(1)', 'data:text/plain,hello']) expect(siteFor(url)).toBeUndefined();
    expect(sitePattern('https://example.com/path')).toBeUndefined();
    expect(sitePattern('<all_urls>')).toBeUndefined();
  });
});
