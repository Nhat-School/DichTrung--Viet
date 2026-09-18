import { test, expect } from '@playwright/test';

test.describe('Shopping Page Mock E2E', () => {
  test('dynamic SKU/variant switching updates price and preserves correct labels', async ({ page }) => {
    // Setup a mock Taobao/1688 product detail page
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <title>夏季纯棉男士短袖T恤 - Taobao</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          .price-box { font-size: 24px; color: #f40; margin-bottom: 12px; }
          .sku-btn { padding: 6px 12px; margin: 4px; border: 1px solid #ccc; cursor: pointer; }
          .sku-btn.selected { border-color: #f40; color: #f40; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1 id="title">夏季纯棉男士短袖T恤 圆领透气休闲半袖</h1>
        <div class="price-box" id="price-display">
          <span class="symbol">¥</span><span class="val" id="price-val">59.00</span>
        </div>
        <div class="sku-section">
          <h3>尺码选择:</h3>
          <button class="sku-btn selected" id="btn-m" data-price="59.00">M码 (100-120斤)</button>
          <button class="sku-btn" id="btn-l" data-price="69.00">L码 (120-140斤)</button>
          <button class="sku-btn" id="btn-xl" data-price="79.00">XL码 (140-160斤)</button>
        </div>
        <div class="stock-section">
          <span id="stock-text">现货库存: 250件</span>
        </div>
        <div class="shipping-section">
          <span id="ship-text">运费: 包邮</span>
        </div>
        <script>
          document.querySelectorAll('.sku-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              document.querySelectorAll('.sku-btn').forEach(b => b.classList.remove('selected'));
              btn.classList.add('selected');
              document.getElementById('price-val').textContent = btn.getAttribute('data-price');
              if (btn.id === 'btn-l') {
                document.getElementById('stock-text').textContent = '现货库存: 80件';
              } else if (btn.id === 'btn-xl') {
                document.getElementById('stock-text').textContent = '预售 15天内发货';
              }
            });
          });
        </script>
      </body>
      </html>
    `);

    // Verify initial values
    await expect(page.locator('#price-val')).toHaveText('59.00');
    await expect(page.locator('#stock-text')).toHaveText('现货库存: 250件');

    // Click variant L (69.00)
    await page.locator('#btn-l').click();
    await expect(page.locator('#price-val')).toHaveText('69.00');
    await expect(page.locator('#stock-text')).toHaveText('现货库存: 80件');

    // Click variant XL (79.00, pre-order)
    await page.locator('#btn-xl').click();
    await expect(page.locator('#price-val')).toHaveText('79.00');
    await expect(page.locator('#stock-text')).toHaveText('预售 15天内发货');
  });
});
