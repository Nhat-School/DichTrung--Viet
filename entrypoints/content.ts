import { defineContentScript } from 'wxt/utils/define-content-script';
import { PageTranslator } from '../lib/page-translator';
import { findPriceElements } from '../lib/price-elements';
import { formatPrice, type Price } from '../lib/prices';
import { isExcluded } from '../lib/sites';
import { request } from '../lib/messages';
import { siteFor, type Crop, type Rate, type Settings } from '../lib/types';

export default defineContentScript({
  matches: ['https://*.taobao.com/*', 'https://*.1688.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    const site = siteFor(location.href);
    if (!site || !document.body) return;
    const host = document.createElement('div');
    host.dataset.tcOwned = ''; host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>
      :host{all:initial}*{box-sizing:border-box}
      .toast,.tooltip{position:fixed;background:#102a26;color:#fff;border:1px solid #345c51;border-radius:12px;padding:12px 16px;font:13px/1.5 system-ui,sans-serif;box-shadow:0 8px 24px #0002;max-width:360px}.toast{bottom:24px;right:24px;pointer-events:auto}.tooltip{white-space:pre-wrap;z-index:3}
      .capture{position:fixed;inset:0;pointer-events:auto;cursor:crosshair;z-index:5}.hint{position:absolute;top:18px;left:50%;transform:translateX(-50%);background:#102a26;color:white;border-radius:10px;padding:12px 18px;font:14px system-ui,sans-serif;pointer-events:none;white-space:nowrap}.selection{position:fixed;border:2px solid #00b88a;background:#00b88a18;box-shadow:0 0 0 9999px #0004;pointer-events:none}
    </style>`;
    document.documentElement.append(host);

    let rate: Rate | null = null;
    let settings: Settings | undefined;
    let priceTimer: ReturnType<typeof setTimeout> | undefined;
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    let captureCleanup: (() => void) | undefined;
    let lastError: string | undefined;

    interface PriceRecord {
      originalHtml: string;
      originalText: string;
      originalTitle: string | null;
      prices: Price[];
      renderedText: string;
    }
    const priceRecords = new Map<Element, PriceRecord>();

    function toast(text: string) {
      shadow.querySelector('.toast')?.remove();
      const node = document.createElement('div'); node.className = 'toast'; node.textContent = text;
      node.onclick = () => node.remove(); shadow.append(node); setTimeout(() => node.remove(), 12000);
    }

    const translator = new PageTranslator(
      document.body,
      text => request<string>({ type: 'translate', text, direction: 'zh-vi' }),
      () => {
        schedulePrices();
        const error = translator.status().error;
        if (error && error !== lastError) { lastError = error; toast(`TranslateChina: ${error}`); }
      },
      undefined,
      texts => request<string[]>({ type: 'translate-batch', texts, direction: 'zh-vi' }),
    );

    function formatPricesInText(text: string, prices: Price[], rateVal: string): string {
      let result = text;
      for (const price of prices) {
        const formatted = formatPrice(price, rateVal, true);
        result = result.replace(price.raw, formatted);
      }
      if (result === text && prices.length > 0) {
        result = prices.map(p => formatPrice(p, rateVal, true)).join(' – ');
      }
      return result;
    }

    function restorePrices() {
      for (const [element, record] of priceRecords) {
        if (element.isConnected) {
          element.innerHTML = record.originalHtml;
          if (record.originalTitle !== null) {
            element.setAttribute('title', record.originalTitle);
          } else {
            element.removeAttribute('title');
          }
          element.removeAttribute('data-tc-owned');
          element.removeAttribute('data-tc-price');
        }
      }
      priceRecords.clear();
    }

    function renderPrices() {
      if (!settings?.enabled[site!] || !rate) {
        restorePrices();
        return;
      }

      // Clean up disconnected elements or elements mutated by site (e.g. variant change)
      for (const [element, record] of priceRecords) {
        if (!element.isConnected) {
          priceRecords.delete(element);
        } else if (element.textContent !== record.renderedText) {
          priceRecords.delete(element);
          element.removeAttribute('data-tc-owned');
          element.removeAttribute('data-tc-price');
        }
      }

      const entries = findPriceElements(document.body, site!, el => translator.originalText(el));
      for (const { element, prices } of entries.slice(0, 300)) {
        if (priceRecords.has(element) || element.closest('[data-tc-price]')) continue;
        const originalText = element.textContent || '';
        const newText = formatPricesInText(originalText, prices, rate.rate);

        priceRecords.set(element, {
          originalHtml: element.innerHTML,
          originalText,
          originalTitle: element.getAttribute('title'),
          prices,
          renderedText: newText,
        });

        element.textContent = newText;
        element.setAttribute('data-tc-owned', 'price');
        element.setAttribute('data-tc-price', '');
        element.setAttribute('title', `Giá gốc: ${prices.map(p => p.raw).join(' · ')} · Tỷ giá: 1 CNY ≈ ${rate.rate} VNĐ`);
      }
    }

    function schedulePrices() {
      clearTimeout(priceTimer);
      priceTimer = setTimeout(renderPrices, 150);
    }

    async function refresh(retry = false) {
      try {
        const state = await request<{ settings: Settings; rate: Rate | null }>({ type: 'get-state' });
        settings = state.settings; rate = state.rate;
        if (settings.enabled[site!]) {
          translator.start();
          if (retry) translator.retry();
        } else {
          translator.stop();
        }
        renderPrices();
      } catch (error) { toast(String(error)); }
    }

    ctx.addEventListener(window, 'scroll', () => { translator.schedule(); schedulePrices(); }, { passive: true, capture: true });
    ctx.addEventListener(window, 'resize', () => { translator.schedule(); schedulePrices(); });
    ctx.addEventListener(window, 'focus', () => void refresh(true));

    // Listen to hover over menus and interactive navigation
    ctx.addEventListener(document, 'mouseover', event => {
      const target = event.target as Element | null;
      if (!target || target.closest('[data-tc-owned]')) return;
      if (target.closest('li, nav, menu, [class*="menu" i], [class*="nav" i], [class*="cate" i], [class*="hover" i], [class*="item" i], [role="menu"]')) {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          translator.schedule();
          schedulePrices();
        }, 150);
      }
    }, { passive: true });

    let lastUrl = location.href;
    const checkUrl = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        void refresh(true);
      }
    };
    ctx.addEventListener(window, 'popstate', checkUrl);
    ctx.addEventListener(window, 'hashchange', checkUrl);

    let tip: HTMLElement | undefined;
    ctx.addEventListener(document, 'pointerover', event => {
      tip?.remove(); tip = undefined;
      if (!(event.target instanceof Element) || captureCleanup) return;
      const target = event.target;
      const priceRec = priceRecords.get(target) || (target.parentElement ? priceRecords.get(target.parentElement) : undefined);
      if (priceRec) {
        const rect = target.getBoundingClientRect();
        tip = document.createElement('div'); tip.className = 'tooltip';
        tip.textContent = `Giá gốc: ${priceRec.prices.map(p => p.raw).join(' · ')}\nTỷ giá: 1 CNY ≈ ${rate?.rate || ''} VNĐ`;
        tip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 370))}px`;
        tip.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - 160))}px`;
        shadow.append(tip);
        return;
      }
      const text = translator.originalsUnder(target);
      if (!text) return;
      const rect = target.getBoundingClientRect();
      tip = document.createElement('div'); tip.className = 'tooltip'; tip.textContent = `Bản gốc: ${text}`;
      tip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 370))}px`;
      tip.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - 160))}px`;
      shadow.append(tip);
    });
    ctx.addEventListener(document, 'pointerout', () => { tip?.remove(); tip = undefined; });

    function getNodesInRect(root: Node, rect: { x: number; y: number; width: number; height: number }): Text[] {
      const nodes: Text[] = [];
      const range = document.createRange();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      const rectRight = rect.x + rect.width;
      const rectBottom = rect.y + rect.height;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent || isExcluded(parent)) continue;
        const data = node.textContent?.trim();
        if (!data) continue;
        try {
          range.selectNodeContents(node);
          const r = range.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left < rectRight && r.right > rect.x && r.top < rectBottom && r.bottom > rect.y) {
            nodes.push(node as Text);
          }
        } catch {}
      }
      return nodes;
    }

    function selectCapture(mode: 'region' | 'image') {
      captureCleanup?.(); tip?.remove();
      const overlay = document.createElement('div'); overlay.className = 'capture';
      const hint = document.createElement('div'); hint.className = 'hint';
      hint.textContent = mode === 'image' ? 'Bấm ảnh cần dịch · Esc để hủy' : 'Kéo để khoanh vùng chữ cần dịch · Esc để hủy';
      const selection = document.createElement('div'); selection.className = 'selection'; selection.hidden = true;
      overlay.append(hint, selection); shadow.append(overlay);
      let start: { x: number; y: number } | undefined;
      const clean = () => {
        overlay.remove(); document.removeEventListener('keydown', keydown, true); window.removeEventListener('scroll', clean, true); window.removeEventListener('resize', clean); captureCleanup = undefined;
      };
      const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); clean(); } };
      const finish = async (rect: { x: number; y: number; width: number; height: number }) => {
        clean();

        // Translate all text nodes in the dragged region immediately on page
        const textNodes = getNodesInRect(document.body, rect);
        if (textNodes.length > 0) {
          void translator.translateNodes(textNodes).then(() => {
            schedulePrices();
          });
        }

        const crop: Crop = { ...rect, viewportWidth: innerWidth, viewportHeight: innerHeight };
        host.style.visibility = 'hidden';
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        try {
          await request({ type: 'capture', crop });
          if (textNodes.length > 0) {
            toast(`Đã dịch ${textNodes.length} đoạn chữ trong vùng chọn.`);
          } else {
            toast('Đang nhận diện chữ trong ảnh. Xem tiến độ và kết quả trong bảng công cụ.');
          }
        } catch (error) {
          if (textNodes.length > 0) {
            toast(`Đã dịch ${textNodes.length} đoạn chữ trong vùng chọn.`);
          } else {
            toast(error instanceof Error ? error.message : String(error));
          }
        } finally {
          host.style.visibility = '';
        }
      };
      overlay.onpointerdown = event => {
        event.preventDefault(); event.stopPropagation();
        if (mode === 'image') {
          overlay.style.pointerEvents = 'none';
          const target = document.elementFromPoint(event.clientX, event.clientY);
          overlay.style.pointerEvents = 'auto';
          let visual = target instanceof HTMLImageElement ? target
            : target?.querySelector('img, canvas, svg')
            || target?.closest('picture')?.querySelector('img')
            || target?.closest('img, canvas, svg, [style*="background"], a, div');
          if (!visual) visual = target as HTMLElement | null;
          const box = visual?.getBoundingClientRect();
          if (!box || box.width < 10 || box.height < 10) {
            hint.textContent = 'Chưa chọn được ảnh. Hãy bấm vào ảnh hoặc kéo khoanh vùng.';
            return;
          }
          const x = Math.max(0, box.left), y = Math.max(0, box.top);
          void finish({ x, y, width: Math.min(innerWidth, box.right) - x, height: Math.min(innerHeight, box.bottom) - y });
          return;
        }
        start = { x: event.clientX, y: event.clientY }; overlay.setPointerCapture(event.pointerId);
      };
      overlay.onpointermove = event => {
        if (!start) return;
        selection.hidden = false;
        selection.style.left = `${Math.min(start.x, event.clientX)}px`; selection.style.top = `${Math.min(start.y, event.clientY)}px`;
        selection.style.width = `${Math.abs(start.x - event.clientX)}px`; selection.style.height = `${Math.abs(start.y - event.clientY)}px`;
      };
      overlay.onpointerup = event => {
        if (!start) return;
        const rect = { x: Math.min(start.x, event.clientX), y: Math.min(start.y, event.clientY), width: Math.abs(start.x - event.clientX), height: Math.abs(start.y - event.clientY) };
        start = undefined;
        if (rect.width < 8 || rect.height < 8) { hint.textContent = 'Vùng quá nhỏ, hãy kéo rộng hơn · Esc để hủy'; return; }
        void finish(rect);
      };
      document.addEventListener('keydown', keydown, true); window.addEventListener('scroll', clean, true); window.addEventListener('resize', clean);
      captureCleanup = clean;
    }
    const listener = (message: { type: string; mode?: 'region' | 'image'; ok?: boolean }, _sender: chrome.runtime.MessageSender, respond: (value: unknown) => void) => {
      switch (message.type) {
        case 'settings-updated': case 'rate-updated': void refresh(true); break;
        case 'page-status': respond(translator.status()); return;
        case 'select-capture': selectCapture(message.mode || 'region'); respond(true); return;
        case 'capture-done': toast(message.ok ? 'Đã nhận diện xong. Mở bảng công cụ → Dịch ảnh để xem và dịch.' : 'Chưa nhận diện được ảnh. Mở bảng công cụ để thử lại.'); break;
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => {
      captureCleanup?.();
      clearTimeout(hoverTimer);
      clearTimeout(priceTimer);
      restorePrices();
      translator.stop();
      chrome.runtime.onMessage.removeListener(listener);
      host.remove();
    });
    void refresh();
  },
});
