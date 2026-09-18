import { defineBackground } from 'wxt/utils/define-background';
import { getSettings } from '../lib/storage';
import { loadRate, validateManualRate } from '../lib/currency';
import { AppError, errorMessage, siteFor, type EngineRequest, type OcrState, type Rate, type Reply, type Request, type Settings } from '../lib/types';

export default defineBackground(() => {
  let offscreenCreating: Promise<void> | undefined;
  let rateRequest: Promise<Rate | null> | undefined;
  const captureGrants = new Map<number, number>();
  let job: { id: string; tabId: number } | undefined;
  const visibleEngines = new Map<string, chrome.runtime.Port>();
  const pendingVisible = new Map<string, { resolve: (value: Reply) => void; timer: ReturnType<typeof setTimeout>; port: chrome.runtime.Port }>();

  async function hasOffscreenDocument(): Promise<boolean> {
    try {
      if ('getContexts' in chrome.runtime) {
        const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
        return contexts.length > 0;
      }
    } catch {}
    return false;
  }

  async function ensureOffscreen(): Promise<void> {
    if (await hasOffscreenDocument()) return;
    if (offscreenCreating) {
      await offscreenCreating;
      return;
    }
    try {
      offscreenCreating = chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.BLOBS],
        justification: 'Chạy worker OCR đóng gói cục bộ và bộ dịch trong cùng document.',
      });
      await offscreenCreating;
    } catch (e: any) {
      if (!e?.message?.includes('single offscreen document')) {
        throw e;
      }
    } finally {
      offscreenCreating = undefined;
    }
  }

  async function offscreen(request: EngineRequest): Promise<Reply> {
    await ensureOffscreen();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await chrome.runtime.sendMessage({ target: 'offscreen', request });
        if (res !== undefined) return res;
      } catch (e: any) {
        if (attempt < 4 && (e?.message?.includes('Receiving end does not exist') || e?.message?.includes('Could not establish connection'))) {
          await new Promise(r => setTimeout(r, 150));
          continue;
        }
        return { ok: false, error: errorMessage(e), code: 'OFFSCREEN_ERROR' };
      }
    }
    return { ok: false, error: 'Tài liệu nền xử lý chưa sẵn sàng.', code: 'OFFSCREEN_TIMEOUT' };
  }
  async function translate(text: string, direction: 'zh-vi' | 'vi-zh') {
    if (typeof text !== 'string' || text.length > 6000 || !['zh-vi', 'vi-zh'].includes(direction)) throw new Error('Yêu cầu dịch không hợp lệ.');
    const result = await offscreen({ action: 'translate', text, direction });
    if (result.ok) return result.data;
    if (['NEED_SETUP', 'NEED_VISIBLE', 'UNSUPPORTED'].includes(result.code || '') && visibleEngines.size) {
      const port = [...visibleEngines.values()].at(-1)!;
      const id = crypto.randomUUID();
      const reply = await new Promise<Reply>(resolve => {
        const timer = setTimeout(() => { pendingVisible.delete(id); resolve({ ok: false, error: 'Bộ dịch phản hồi quá lâu. Hãy thử lại.', code: 'TIMEOUT' }); }, 60000);
        pendingVisible.set(id, { resolve, timer, port });
        try { port.postMessage({ id, text, direction }); } catch { clearTimeout(timer); pendingVisible.delete(id); resolve(result); }
      });
      if (reply.ok) return reply.data;
      throw new AppError(reply.code || 'ERROR', reply.error);
    }
    throw new AppError(result.code || 'ERROR', result.error);
  }
  async function translateBatch(texts: string[], direction: 'zh-vi' | 'vi-zh') {
    if (!Array.isArray(texts) || !['zh-vi', 'vi-zh'].includes(direction)) throw new Error('Yêu cầu dịch không hợp lệ.');
    if (!texts.length) return [];
    const result = await offscreen({ action: 'translate-batch', texts, direction });
    if (result.ok) return result.data;
    return Promise.all(texts.map(t => translate(t, direction)));
  }
  async function getRate(force = false) {
    if (rateRequest) return rateRequest;
    rateRequest = (async () => {
      const settings = await getSettings();
      const { rate: cached } = (await chrome.storage.local.get('rate')) as { rate?: Rate };
      const rate = await loadRate({ cached, manualRate: settings.manualRate, force });
      if (rate?.source === 'Frankfurter') await chrome.storage.local.set({ rate });
      return rate;
    })().finally(() => { rateRequest = undefined; });
    return rateRequest;
  }
  async function broadcast(type: string) {
    const tabs = await chrome.tabs.query({ url: ['https://*.taobao.com/*', 'https://*.1688.com/*'] });
    await Promise.allSettled(tabs.map(tab => tab.id !== undefined ? chrome.tabs.sendMessage(tab.id, { type }) : Promise.resolve()));
  }
  async function startCapture(tabId: number, mode: 'region' | 'image') {
    const tab = await chrome.tabs.get(tabId);
    if (!siteFor(tab.url || '')) throw new Error('Mở tab Taobao hoặc 1688 đang xem để chọn ảnh.');
    captureGrants.set(tabId, Date.now() + 600000);
    await chrome.tabs.sendMessage(tabId, { type: 'select-capture', mode });
  }
  async function cancelOcr() {
    const current = job;
    job = undefined;
    if (current) await offscreen({ action: 'cancel-ocr', jobId: current.id });
    await chrome.storage.session.remove('ocr');
  }
  async function capture(crop: import('../lib/types').Crop, sender: chrome.runtime.MessageSender) {
    const tabId = sender.tab?.id;
    if (tabId === undefined || !siteFor(sender.tab?.url || '')) throw new Error('Mở tab Taobao hoặc 1688 đang xem để chọn ảnh.');
    captureGrants.delete(tabId);
    const currentTab = await chrome.tabs.get(tabId);
    const image = await chrome.tabs.captureVisibleTab(currentTab.windowId, { format: 'png' });
    if (job) await cancelOcr();
    const current = { id: crypto.randomUUID(), tabId };
    job = current;
    await chrome.storage.session.set({ ocr: { jobId: current.id, tabId, state: 'working', progress: 0, expires: Date.now() + 5 * 60000 } });
    await chrome.alarms.create('clear-ocr', { delayInMinutes: 5 });
    void offscreen({ action: 'ocr', image, crop, jobId: current.id }).then(async result => {
      if (job?.id !== current.id) return;
      job = undefined;
      await chrome.storage.session.set({ ocr: { jobId: current.id, tabId, state: result.ok ? 'done' : 'error', ...(result.ok ? { result: result.data } : { error: result.error }), expires: Date.now() + 5 * 60000 } });
      await chrome.alarms.create('clear-ocr', { delayInMinutes: 5 });
      await chrome.tabs.sendMessage(tabId, { type: 'capture-done', ok: result.ok }).catch(() => {});
    }).catch(async error => {
      if (job?.id !== current.id) return;
      job = undefined;
      await chrome.storage.session.set({ ocr: { state: 'error', error: errorMessage(error), expires: Date.now() + 5 * 60000 } });
    });
    return true;
  }

  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'visible-engine' || port.sender?.tab && !port.sender.url?.startsWith(chrome.runtime.getURL(''))) return;
    const id = crypto.randomUUID();
    visibleEngines.set(id, port);
    port.onMessage.addListener(message => {
      const pending = pendingVisible.get(message.id);
      if (!pending || pending.port !== port) return;
      clearTimeout(pending.timer); pendingVisible.delete(message.id); pending.resolve(message.result);
    });
    port.onDisconnect.addListener(() => {
      visibleEngines.delete(id);
      for (const [key, pending] of pendingVisible) if (pending.port === port) {
        clearTimeout(pending.timer); pendingVisible.delete(key);
        pending.resolve({ ok: false, error: 'Giữ bảng công cụ mở khi Chrome cần giao diện để dịch.', code: 'NEED_VISIBLE' });
      }
    });
  });

  chrome.runtime.onMessage.addListener((message: Request & { target?: string; jobId?: string; progress?: number }, sender, respond) => {
    if (message.target) return;
    const extensionUI = !sender.tab || sender.url?.startsWith(chrome.runtime.getURL(''));
    // Only our extension UI and supported content scripts can use the router.
    if (sender.id !== chrome.runtime.id || (!extensionUI && !siteFor(sender.tab?.url || ''))) return;
    (async () => {
      switch (message.type as string) {
        case 'translate': return translate((message as any).text, (message as any).direction);
        case 'translate-batch': return translateBatch((message as any).texts, (message as any).direction);
        case 'get-state': return { settings: await getSettings(), rate: await getRate() };
        case 'get-rate': {
          const rate = await getRate((message as any).force === true);
          if ((message as any).force) void broadcast('rate-updated');
          return rate;
        }
        case 'set-settings': {
          if (!extensionUI) throw new Error('Thay đổi cài đặt từ bảng công cụ.');
          const next = (message as Extract<Request, { type: 'set-settings' }>).settings;
          const settings = await getSettings();
          if (next.manualRate !== undefined) settings.manualRate = validateManualRate(next.manualRate);
          if (next.enabled) for (const key of ['taobao', '1688'] as const) if (typeof next.enabled[key] === 'boolean') settings.enabled[key] = next.enabled[key];
          await chrome.storage.local.set({ settings });
          // Do not let an in-flight old settings request win over the new setting.
          if (rateRequest) await rateRequest;
          void broadcast('settings-updated');
          return settings;
        }
        case 'engine-status': {
          const result = await offscreen({ action: 'status' });
          if (!result.ok) throw new Error(result.error);
          return result.data;
        }
        case 'start-capture': {
          if (!extensionUI) throw new Error('Bắt đầu từ biểu tượng extension.');
          const m = message as Extract<Request, { type: 'start-capture' }>;
          return startCapture(m.tabId, m.mode);
        }
        case 'capture': return capture((message as Extract<Request, { type: 'capture' }>).crop, sender);
        case 'get-ocr': {
          if (!extensionUI) throw new Error('Mở bảng công cụ để xem kết quả ảnh.');
          const { ocr } = (await chrome.storage.session.get('ocr')) as { ocr?: OcrState };
          if (ocr && ocr.expires < Date.now()) { await chrome.storage.session.remove('ocr'); return null; }
          return ocr || null;
        }
        case 'clear-ocr': case 'cancel-ocr': {
          if (!extensionUI) throw new Error('Hủy từ bảng công cụ.');
          return cancelOcr();
        }
        case 'get-page-status': {
          if (!extensionUI) throw new Error('Mở bảng công cụ để xem trạng thái.');
          try { return await chrome.tabs.sendMessage((message as any).tabId, { type: 'page-status' }); }
          catch { return null; }
        }
        case 'ocr-progress': {
          if (sender.url !== chrome.runtime.getURL('offscreen.html') || job?.id !== message.jobId) return;
          const { ocr } = (await chrome.storage.session.get('ocr')) as { ocr?: OcrState };
          if (ocr && ocr.jobId === message.jobId && ocr.state === 'working') await chrome.storage.session.set({ ocr: { ...ocr, progress: message.progress, status: (message as any).status } });
          return;
        }
        default: throw new Error('Yêu cầu không được hỗ trợ.');
      }
    })().then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, error: errorMessage(error), code: error instanceof AppError ? error.code : 'ERROR' }));
    return true;
  });

  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({ id: 'tc-image', title: 'TranslateChina: Dịch vùng ảnh đang thấy', contexts: ['image'], documentUrlPatterns: ['https://*.taobao.com/*', 'https://*.1688.com/*'] });
    if (reason === 'install') await chrome.runtime.openOptionsPage();
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'tc-image' && tab?.id) {
      void chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      void startCapture(tab.id, 'image').catch(() => {});
    }
  });
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'clear-ocr') void cancelOcr(); });
  chrome.tabs.onRemoved.addListener(tabId => { captureGrants.delete(tabId); });
});
