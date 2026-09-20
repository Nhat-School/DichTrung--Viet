import { defineContentScript } from 'wxt/utils/define-content-script';
import { PageTranslator } from '../lib/page-translator';
import { findPriceElements } from '../lib/price-elements';
import { formatPrice, parsePrices, type Price } from '../lib/prices';
import { request } from '../lib/messages';
import { isCommerceSite, isSiteEnabled, siteFor, type Crop, type Rate, type Settings } from '../lib/types';

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  allFrames: true,
  // Login providers frequently build a dialog in an about:blank or srcdoc frame.
  // Chrome permits this only when the parent page is covered by our host access.
  matchAboutBlank: true,
  main(ctx) {
    let currentUrl = location.href;
    if (window !== window.top && (currentUrl === 'about:blank' || !currentUrl.startsWith('http'))) {
      try {
        currentUrl = window.top?.location.href || currentUrl;
      } catch {
        currentUrl = document.referrer || currentUrl;
      }
    }
    const site = siteFor(currentUrl) || (location.protocol.startsWith('http') ? `${location.protocol}//${location.host}` : undefined);
    if (!site || !document.body || document.querySelector('[data-tc-root]')) return;
    const host = document.createElement('div');
    host.dataset.tcRoot = ''; host.dataset.tcOwned = ''; host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
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
    let captchaTimer: ReturnType<typeof setTimeout> | undefined;
    let captureCleanup: (() => void) | undefined;
    let lastError: string | undefined;

    interface PriceRecord {
      originalHtml: string;
      originalText: string;
      originalTitle: string | null;
      originalStyle: string | null;
      prices: Price[];
      renderedText: string;
    }
    const priceRecords = new Map<Element, PriceRecord>();
    const processedCaptchaImages = new WeakSet<Element>();

    function toast(text: string) {
      shadow.querySelector('.toast')?.remove();
      const node = document.createElement('div'); node.className = 'toast'; node.textContent = text;
      node.onclick = () => node.remove(); shadow.append(node); setTimeout(() => node.remove(), 12000);
    }

    const captchaAttempts = new WeakMap<Element, number>();
    async function scanCaptchaPrompt() {
      const roots: (Document | ShadowRoot)[] = [document];
      const allElements = document.querySelectorAll('*');
      for (const node of allElements) {
        if (node.shadowRoot) roots.push(node.shadowRoot);
      }
      const selector = '[class*="captcha" i] img, [id*="captcha" i] img, .baxia-dialog img, [id*="baxia" i] img, .nc-container img, [id*="nc_" i] img, .ui-dialog img, [class*="dialog" i] img, [class*="modal" i] img, [class*="challenge" i] img, [class*="verify" i] img, [class*="turing" i] img, img[src*="captcha" i], img[src*="challenge" i], img[src*="getimage" i], [class*="captcha" i] canvas, [id*="captcha" i] canvas, .baxia-dialog canvas, [class*="dialog" i] canvas, [class*="modal" i] canvas, [class*="captcha" i] [style*="background-image"], [id*="captcha" i] [style*="background-image"], .baxia-dialog [style*="background-image"]';
      const candidates: HTMLElement[] = [];
      for (const root of roots) {
        candidates.push(...root.querySelectorAll<HTMLElement>(selector));
      }
      for (const el of candidates) {
        if (processedCaptchaImages.has(el) || el.closest('[data-tc-owned]')) continue;
        const rect = el.getBoundingClientRect();
        const isBanner = rect.width >= 40 && rect.width <= 550 && rect.height >= 10 && rect.height <= 150 && (rect.width / (rect.height || 1) >= 1.1);
        if (!isBanner) continue;
        if (el instanceof HTMLImageElement && !el.complete && el.naturalWidth === 0) continue;
        const attempts = captchaAttempts.get(el) || 0;
        if (attempts >= 3) {
          processedCaptchaImages.add(el);
          continue;
        }
        captchaAttempts.set(el, attempts + 1);
        try {
          let dataUrl = '';
          if (el instanceof HTMLImageElement && el.src) {
            if (el.src.startsWith('data:image/')) {
              dataUrl = el.src;
            } else if (el.naturalWidth > 0) {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = el.naturalWidth; canvas.height = el.naturalHeight;
                const ctx2d = canvas.getContext('2d');
                if (ctx2d) { ctx2d.drawImage(el, 0, 0); dataUrl = canvas.toDataURL('image/png'); }
              } catch {
                dataUrl = el.src;
              }
            } else {
              dataUrl = el.src;
            }
          } else if (el instanceof HTMLCanvasElement && el.width > 0) {
            try { dataUrl = el.toDataURL('image/png'); } catch {}
          } else {
            const bg = window.getComputedStyle(el).backgroundImage;
            const match = bg && /url\(["']?([^"']+)["']?\)/i.exec(bg);
            if (match) dataUrl = match[1];
          }
          if (dataUrl) {
            const ocrRes = await request<{ text: string }>({ type: 'ocr-image', image: dataUrl }).catch(() => null);
            if (ocrRes?.text?.trim()) {
              processedCaptchaImages.add(el);
              const zh = ocrRes.text.trim().replace(/\s+/g, ' ');
              const vi = await request<string>({ type: 'translate', text: zh, direction: 'zh-vi' }).catch(() => zh);
              const parent = el.parentElement;
              if (parent) {
                const existing = parent.querySelector('.tc-captcha-badge');
                if (existing) {
                  existing.innerHTML = `<span>🏷️ Yêu cầu captcha:</span> <span style="color:#ffffff;text-decoration:underline;">${vi}</span>`;
                } else {
                  const badge = document.createElement('div');
                  badge.className = 'tc-captcha-badge';
                  badge.dataset.tcOwned = '';
                  badge.style.cssText = 'background:#102a26;color:#2be6ab;font:bold 13px/1.4 system-ui,sans-serif;padding:8px 12px;border-radius:8px;margin:6px 0;display:flex;align-items:center;gap:6px;box-shadow:0 3px 10px rgba(0,0,0,0.25);border:1px solid #23815e;z-index:2147483647;';
                  badge.innerHTML = `<span>🏷️ Yêu cầu captcha:</span> <span style="color:#ffffff;text-decoration:underline;">${vi}</span>`;
                  parent.insertBefore(badge, el);
                }
              }
            }
          }
        } catch {}
      }
    }

    function scheduleCaptcha() {
      clearTimeout(captchaTimer);
      captchaTimer = setTimeout(() => void scanCaptchaPrompt(), 300);
    }

    const translator = new PageTranslator(
      document.documentElement,
      text => request<string>({ type: 'translate', text, direction: 'zh-vi' }),
      () => {
        schedulePrices();
        scheduleCaptcha();
        const error = translator.status().error;
        if (error && error !== lastError) { lastError = error; toast(`TranslateChina: ${error}`); }
      },
      undefined,
      texts => request<string[]>({ type: 'translate-batch', texts, direction: 'zh-vi' }),
    );

    function translatePriceSuffixes(text: string): string {
      return text
        .replace(/(\d+)\s*件起批/g, ' ($1 chiếc sỉ)')
        .replace(/件起批/g, ' (giá sỉ)')
        .replace(/起批/g, ' (giá sỉ)')
        .replace(/(\d+)\s*件起/g, ' (từ $1 chiếc)')
        .replace(/起/g, ' trở lên')
        .replace(/售\s*([0-9+万kK]+)\s*件/g, ' · Đã bán $1')
        .replace(/\/\s*件/g, '/chiếc')
        .replace(/\/\s*个/g, '/cái')
        .replace(/\/\s*套/g, '/bộ')
        .replace(/\/\s*双/g, '/đôi')
        .replace(/\/\s*包/g, '/gói')
        .replace(/\/\s*箱/g, '/thùng');
    }

    function formatPricesInText(text: string, prices: Price[], rateVal: string): string {
      let result = text;
      for (const price of prices) {
        const formatted = formatPrice(price, rateVal, true);
        result = result.replace(price.raw, formatted);
      }
      if (result === text && prices.length > 0) {
        result = prices.map(p => formatPrice(p, rateVal, true)).join(' – ');
      }
      return translatePriceSuffixes(result);
    }

    function applyPriceStyle(element: Element) {
      if (element instanceof HTMLElement) {
        element.style.setProperty('font-weight', '800', 'important');
        element.style.setProperty('background-color', '#ffe8d6', 'important');
        element.style.setProperty('color', '#b71c1c', 'important');
        element.style.setProperty('padding', '2px 6px', 'important');
        element.style.setProperty('border-radius', '4px', 'important');
        element.style.setProperty('border', '1px solid #ffd0b0', 'important');
        element.style.setProperty('display', 'inline-block', 'important');
        element.style.setProperty('line-height', '1.3', 'important');
        element.style.setProperty('box-shadow', '0 1px 2px rgba(183, 28, 28, 0.08)', 'important');
      }
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
          if (record.originalStyle !== null) {
            element.setAttribute('style', record.originalStyle);
          } else {
            element.removeAttribute('style');
          }
          element.removeAttribute('data-tc-owned');
          element.removeAttribute('data-tc-price');
        }
      }
      priceRecords.clear();
    }

    function renderPrices() {
      if (!isCommerceSite(site) || !isSiteEnabled(settings, site) || !rate) {
        restorePrices();
        return;
      }

      // Clean up disconnected elements or elements mutated by site (e.g. variant change)
      for (const [element, record] of priceRecords) {
        if (!element.isConnected) {
          priceRecords.delete(element);
        } else if (element.textContent !== record.renderedText) {
          const currentText = element.textContent || '';
          const newPrices = parsePrices(currentText, true);
          if (newPrices.length > 0) {
            const updated = formatPricesInText(currentText, newPrices, rate.rate);
            record.originalText = currentText;
            record.prices = newPrices;
            record.renderedText = updated;
            element.textContent = updated;
            element.setAttribute('data-tc-owned', 'price');
            element.setAttribute('data-tc-price', '');
            applyPriceStyle(element);
          } else {
            priceRecords.delete(element);
            element.removeAttribute('data-tc-owned');
            element.removeAttribute('data-tc-price');
            if (record.originalStyle !== null) {
              element.setAttribute('style', record.originalStyle);
            } else {
              element.removeAttribute('style');
            }
          }
        } else {
          // Re-evaluate with current rate if rate changed
          const updatedText = formatPricesInText(record.originalText, record.prices, rate.rate);
          if (updatedText !== record.renderedText) {
            record.renderedText = updatedText;
            element.textContent = updatedText;
            element.setAttribute('title', `Giá gốc: ${record.prices.map(p => p.raw).join(' · ')} · Tỷ giá: 1 CNY ≈ ${rate.rate} VNĐ`);
            applyPriceStyle(element);
          }
        }
      }

      const entries = findPriceElements(document.body, site, el => translator.originalText(el));
      for (const { element, prices } of entries.slice(0, 300)) {
        if (priceRecords.has(element) || element.closest('[data-tc-price]')) continue;
        const originalText = element.textContent || '';
        const newText = formatPricesInText(originalText, prices, rate.rate);

        priceRecords.set(element, {
          originalHtml: element.innerHTML,
          originalText,
          originalTitle: element.getAttribute('title'),
          originalStyle: element.getAttribute('style'),
          prices,
          renderedText: newText,
        });

        element.textContent = newText;
        element.setAttribute('data-tc-owned', 'price');
        element.setAttribute('data-tc-price', '');
        element.setAttribute('title', `Giá gốc: ${prices.map(p => p.raw).join(' · ')} · Tỷ giá: 1 CNY ≈ ${rate.rate} VNĐ`);
        applyPriceStyle(element);
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
        if (isSiteEnabled(settings, site)) {
          translator.start();
          if (retry) translator.retry();
        } else {
          translator.stop();
        }
        renderPrices();
      } catch (error) { toast(String(error)); }
    }

    ctx.addEventListener(window, 'scroll', () => { translator.schedule(); schedulePrices(); scheduleCaptcha(); }, { passive: true, capture: true });
    ctx.addEventListener(window, 'resize', () => { translator.schedule(); schedulePrices(); scheduleCaptcha(); });
    ctx.addEventListener(window, 'focus', () => void refresh(true));

    // Listen to hover over menus and interactive navigation
    ctx.addEventListener(document, 'mouseover', event => {
      const target = event.target as Element | null;
      if (!target || target.closest('[data-tc-owned]')) return;
      if (target.closest('li, nav, menu, [class*="menu" i], [class*="nav" i], [class*="cate" i], [class*="hover" i], [class*="item" i], [role="menu"], [class*="captcha" i], .baxia-dialog')) {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          translator.schedule();
          schedulePrices();
          scheduleCaptcha();
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

        // Keep the selected pixels stable: do not translate/resize DOM while capturing.
        const crop: Crop = { ...rect, viewportWidth: innerWidth, viewportHeight: innerHeight };
        host.style.visibility = 'hidden';
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        try {
          await request({ type: 'capture', crop });
          toast('Đang nhận diện chữ trong ảnh. Xem tiến độ và kết quả trong bảng công cụ.');
        } catch (error) {
          toast(error instanceof Error ? error.message : String(error));
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
          let visual: Element | null | undefined = target instanceof HTMLImageElement ? target : target?.closest('canvas,svg,picture');
          if (!visual && target) {
            // An image may have a transparent click-target or CSS background on top.
            visual = document.elementsFromPoint(event.clientX, event.clientY).find(element =>
              element instanceof HTMLImageElement || getComputedStyle(element).backgroundImage !== 'none');
          }
          const box = visual?.getBoundingClientRect();
          if (!box || box.width < 10 || box.height < 10) {
            hint.textContent = 'Chưa chọn được ảnh. Nhấn Esc rồi dùng Khoanh vùng.';
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
      clearTimeout(captchaTimer);
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
