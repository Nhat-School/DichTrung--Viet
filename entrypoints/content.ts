import { defineContentScript } from 'wxt/utils/define-content-script';
import { PageTranslator } from '../lib/page-translator';
import { findPriceElements } from '../lib/price-elements';
import { formatPrice } from '../lib/prices';
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
      :host{all:initial}*{box-sizing:border-box}.badge{position:fixed;background:#e2f5ec;color:#11563f;border:1px solid #afd9c4;border-radius:5px;padding:2px 5px;font:600 11px/1.3 system-ui,sans-serif;white-space:nowrap;pointer-events:auto;box-shadow:0 1px 3px #0001;max-width:300px;overflow:hidden;text-overflow:ellipsis}
      .toast,.tooltip{position:fixed;background:#102a26;color:#fff;border:1px solid #345c51;border-radius:12px;padding:12px 16px;font:13px/1.5 system-ui,sans-serif;box-shadow:0 8px 24px #0002;max-width:360px}.toast{bottom:24px;right:24px;pointer-events:auto}.tooltip{white-space:pre-wrap;z-index:3}
      .capture{position:fixed;inset:0;pointer-events:auto;cursor:crosshair;z-index:5}.hint{position:absolute;top:18px;left:50%;transform:translateX(-50%);background:#102a26;color:white;border-radius:10px;padding:12px 18px;font:14px system-ui,sans-serif;pointer-events:none;white-space:nowrap}.selection{position:fixed;border:2px solid #00b88a;background:#00b88a18;box-shadow:0 0 0 9999px #0004;pointer-events:none}
    </style>`;
    document.documentElement.append(host);
    const badgeLayer = document.createElement('div'); shadow.append(badgeLayer);
    let rate: Rate | null = null;
    let settings: Settings | undefined;
    let priceTimer: ReturnType<typeof setTimeout> | undefined;
    let badges: { element: Element; label: HTMLDivElement }[] = [];
    let captureCleanup: (() => void) | undefined;
    let lastError: string | undefined;
    function toast(text: string) {
      shadow.querySelector('.toast')?.remove();
      const node = document.createElement('div'); node.className = 'toast'; node.textContent = text;
      node.onclick = () => node.remove(); shadow.append(node); setTimeout(() => node.remove(), 12000);
    }
    const translator = new PageTranslator(document.body, text => request<string>({ type: 'translate', text, direction: 'zh-vi' }), () => {
      schedulePrices();
      const error = translator.status().error;
      if (error && error !== lastError) { lastError = error; toast(`TranslateChina: ${error}`); }
    });
    function positionBadges() {
      for (const { element, label } of badges) {
        const rect = element.getBoundingClientRect();
        const show = element.isConnected && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
        label.hidden = !show;
        if (show) {
          const width = label.offsetWidth;
          const x = rect.right + width + 8 < innerWidth ? rect.right + 5 : Math.max(4, Math.min(rect.left, innerWidth - width - 6));
          const y = rect.right + width + 8 < innerWidth ? rect.top : rect.bottom;
          label.style.left = `${x}px`; label.style.top = `${Math.min(y, innerHeight - 20)}px`;
        }
      }
    }
    function renderPrices() {
      if (!settings?.enabled[site!] || !rate) { badgeLayer.replaceChildren(); badges = []; return; }
      const entries = findPriceElements(document.body, site!, element => translator.originalText(element));
      const fragment = document.createDocumentFragment(); badges = [];
      for (const { element, prices } of entries.slice(0, 250)) {
        const label = document.createElement('div'); label.className = 'badge';
        label.textContent = prices.map(price => formatPrice(price, rate!.rate)).join(' · ');
        label.title = `Ước tính: 1 CNY = ${rate.rate} VNĐ · ${rate.source === 'manual' ? 'Tỷ giá tự nhập' : `Frankfurter ${rate.date}`} ${rate.stale ? '· Tỷ giá chưa cập nhật' : ''}\nChưa gồm các khoản phí không hiển thị trên trang.`;
        fragment.append(label); badges.push({ element, label });
      }
      badgeLayer.replaceChildren(fragment); positionBadges();
    }
    function schedulePrices() { clearTimeout(priceTimer); priceTimer = setTimeout(renderPrices, 200); }
    async function refresh(retry = false) {
      try {
        const state = await request<{ settings: Settings; rate: Rate | null }>({ type: 'get-state' });
        settings = state.settings; rate = state.rate;
        if (settings.enabled[site!]) { translator.start(); if (retry) translator.retry(); }
        else translator.stop();
        renderPrices();
      } catch (error) { toast(String(error)); }
    }
    ctx.addEventListener(window, 'scroll', () => { positionBadges(); translator.schedule(); }, { passive: true, capture: true });
    ctx.addEventListener(window, 'resize', () => { positionBadges(); translator.schedule(); });
    ctx.addEventListener(window, 'focus', () => void refresh(true));
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
      const text = translator.originalsUnder(event.target);
      if (!text) return;
      const rect = event.target.getBoundingClientRect();
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
      badgeLayer.hidden = true;
      let start: { x: number; y: number } | undefined;
      const clean = () => {
        overlay.remove(); badgeLayer.hidden = false; document.removeEventListener('keydown', keydown, true); window.removeEventListener('scroll', clean, true); window.removeEventListener('resize', clean); captureCleanup = undefined;
      };
      const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); clean(); } };
      const finish = async (rect: { x: number; y: number; width: number; height: number }) => {
        const crop: Crop = { ...rect, viewportWidth: innerWidth, viewportHeight: innerHeight };
        clean(); host.style.visibility = 'hidden';
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        try { await request({ type: 'capture', crop }); toast('Đang nhận diện chữ. Xem tiến độ và kết quả trong bảng công cụ.'); }
        catch (error) { toast(error instanceof Error ? error.message : String(error)); }
        finally { host.style.visibility = ''; }
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
      captureCleanup?.(); translator.stop(); clearTimeout(priceTimer); chrome.runtime.onMessage.removeListener(listener); host.remove();
    });
    void refresh();
  },
});
