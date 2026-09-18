import { chromium, test, expect, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

let context: BrowserContext;
let app: Page;
let extensionId: string;
let fixtureExtension: string;
test.beforeAll(async () => {
  const extension = fs.existsSync(path.resolve('.output/manifest.json')) ? path.resolve('.output') : path.resolve('.output/chrome-mv3');
  // Grant a synthetic site in a temporary test-only manifest. Native Chrome permission
  // prompts are not automatable headlessly; all runtime code is the production build.
  fixtureExtension = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-extension-test-'));
  fs.cpSync(extension, fixtureExtension, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureExtension, 'manifest.json'), 'utf8'));
  expect(manifest.host_permissions).not.toContain('<all_urls>');
  manifest.host_permissions.push('https://news.example.test/*');
  fs.writeFileSync(path.join(fixtureExtension, 'manifest.json'), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${fixtureExtension}`, `--load-extension=${fixtureExtension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
  app = await context.newPage();
  await app.goto(`chrome-extension://${extensionId}/options.html`);
  await app.evaluate(async () => {
    await chrome.storage.local.set({ settings: { enabled: { taobao: true, '1688': true }, manualRate: '3870', onlineFallback: false } });
    await chrome.runtime.sendMessage({ type: 'engine-status' });
  });
});
test.afterAll(async () => { await context?.close(); if (fixtureExtension) fs.rmSync(fixtureExtension, { recursive: true, force: true }); });

test('real packaged OCR recovers Chinese labels from the user report', async ({}, testInfo) => {
  test.setTimeout(120000);
  const data = fs.readFileSync(path.resolve('tests/fixtures/stroller-ocr-report.png')).toString('base64');
  const reply = await app.evaluate(async image => {
    const img = new Image(); img.src = image; await img.decode();
    return chrome.runtime.sendMessage({ target: 'offscreen', request: {
      action: 'ocr', image, jobId: 'test-stroller',
      crop: { x: 35, y: 12, width: 678, height: 675, viewportWidth: img.naturalWidth, viewportHeight: img.naturalHeight },
    } });
  }, 'data:image/png;base64,' + data);
  console.log('Packaged OCR:', JSON.stringify(reply.ok ? { text: reply.data.text, confidence: reply.data.confidence, lines: reply.data.lines } : reply));
  expect(reply.ok).toBe(true);
  for (const text of ['六重减震', '双层餐盘', '加大车棚', '双管车架']) expect(reply.data.text).toContain(text);
  expect(reply.data.text).not.toContain('一一一');
  await testInfo.attach('recognized-text', { body: reply.data.text, contentType: 'text/plain' });
  await app.evaluate(async result => {
    await chrome.storage.session.set({ ocr: { jobId: 'screenshot-preview', state: 'done', result, expires: Date.now() + 300000 } });
  }, reply.data);
  await expect(app.getByAltText('Vùng ảnh vừa chọn để nhận diện')).toBeVisible();
  fs.mkdirSync('artifacts', { recursive: true });
  await app.screenshot({ path: 'artifacts/ocr-result.png', fullPage: true });
});

test('general Chinese page is opt-in and preserves forms and dynamic labels', async () => {
  const page = await context.newPage();
  await context.route('https://news.example.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html lang="zh"><meta charset="utf-8"><body><h1>商品详情</h1><p id="dynamic">现货</p><input value="我的内容"><button id="change">搜索</button><script>document.getElementById("change").onclick=()=>document.getElementById("dynamic").textContent="预售"</script></body></html>' }));
  await page.goto('https://news.example.test/article');
  expect(await page.locator('[data-tc-root]').count()).toBe(0);
  await app.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const target = tabs.find(tab => tab.url?.startsWith('https://news.example.test/'))!;
    const reply = await chrome.runtime.sendMessage({ type: 'enable-site', tabId: target.id! });
    if (!reply.ok) throw new Error(reply.error);
  });
  await expect(page.locator('h1')).toHaveText('Chi tiết sản phẩm');
  await expect(page.locator('#dynamic')).toHaveText('Hàng có sẵn');
  await page.locator('#change').click();
  await expect(page.locator('#dynamic')).toHaveText('Đặt trước');
  await expect(page.locator('input')).toHaveValue('我的内容');
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Chi tiết sản phẩm');
  await app.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: 'set-settings', settings: { enabled: { 'https://news.example.test': false } } });
  });
  await expect(page.locator('h1')).toHaveText('商品详情');
  await expect(page.locator('#dynamic')).toHaveText('现货');
  await page.close();
});

test('UI clearly identifies online fallback and independent search/chat drafts', async () => {
  await app.reload();
  await app.evaluate(() => chrome.storage.session.remove('ocr'));
  await app.getByRole('button', { name: 'Thiết lập', exact: true }).click();
  await expect(app.getByText('Cho phép Google dịch khi bộ dịch trên máy chưa sẵn sàng')).toBeVisible();
  await app.screenshot({ path: 'artifacts/settings.png', fullPage: true });
  await app.getByRole('button', { name: 'Tìm & nhắn', exact: true }).click();
  const search = app.getByLabel('Từ khóa sản phẩm (Tiếng Việt)');
  await search.fill('áo màu trắng');
  await app.getByRole('button', { name: /Nhắn người bán/ }).click();
  const message = app.getByLabel('Nội dung nhắn cho shop (Tiếng Việt)');
  await message.fill('Shop còn hàng không?');
  await app.getByRole('button', { name: /Tìm hàng/ }).click();
  await expect(search).toHaveValue('áo màu trắng');
  await app.getByRole('button', { name: /Nhắn người bán/ }).click();
  await expect(message).toHaveValue('Shop còn hàng không?');
});
