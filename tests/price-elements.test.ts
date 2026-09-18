import { describe, it, expect } from 'vitest';
import { findPriceElements } from '../lib/price-elements';

describe('price-elements module', () => {
  it('detects simple price element with price class', () => {
    document.body.innerHTML = `
      <div id="container">
        <div class="product-price">¥ 199.00</div>
        <div class="product-title">Áo sơ mi trắng</div>
      </div>
    `;
    const entries = findPriceElements(document.body, 'taobao', el => el.textContent || '');
    expect(entries).toHaveLength(1);
    expect(entries[0].prices[0].amounts).toEqual(['199']);
  });

  it('merges split currency, integer, and decimal spans into single parent container', () => {
    document.body.innerHTML = `
      <div class="price-container"><span class="currency">¥</span><span class="price-int">88</span><span class="price-decimal">.90</span></div>
    `;
    const entries = findPriceElements(document.body, '1688', el => el.textContent || '');
    expect(entries).toHaveLength(1);
    expect(entries[0].element.className).toBe('price-container');
    expect(entries[0].prices[0].amounts).toEqual(['88.9']);
  });

  it('deduplicates child elements when parent contains the full price', () => {
    document.body.innerHTML = `
      <div class="detail-price-box">
        <span class="price-inner">¥ 250.00</span>
      </div>
    `;
    const entries = findPriceElements(document.body, 'taobao', el => el.textContent || '');
    // Should return only 1 entry, not both child and parent
    expect(entries).toHaveLength(1);
    expect(entries[0].prices[0].amounts).toEqual(['250']);
  });

  it('ignores excluded elements such as inputs, contenteditable, and tc-owned', () => {
    document.body.innerHTML = `
      <input type="text" value="¥ 500" class="product-price" />
      <div data-tc-owned><span class="price">¥ 100</span></div>
      <div hidden><span class="price">¥ 200</span></div>
      <div class="visible-price">¥ 350.00</div>
    `;
    const entries = findPriceElements(document.body, 'taobao', el => el.textContent || '');
    expect(entries).toHaveLength(1);
    expect(entries[0].element.className).toBe('visible-price');
  });

  it('detects prices even when child text nodes were read via readText callback', () => {
    document.body.innerHTML = `
      <div class="sku-price">
        <span class="label">Giá sau ưu đãi</span>
        <span class="num">¥ 79.00</span>
      </div>
    `;
    const entries = findPriceElements(document.body, '1688', el => el.textContent || '');
    expect(entries).toHaveLength(1);
    expect(entries[0].prices[0].amounts).toEqual(['79']);
  });
});
