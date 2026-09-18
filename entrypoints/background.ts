import { defineBackground } from 'wxt/utils/define-background';
import { getSettings, localStorageArea } from '../lib/storage';
import { loadRate, validateManualRate } from '../lib/currency';
import { AppError, errorMessage, isCommerceSite, siteFor, sitePattern, type EngineRequest, type OcrState, type Rate, type Reply, type Request } from '../lib/types';

export default defineBackground(() => {
  let offscreenCreating: Promise<void> | undefined;
  let rateRequest: Promise<Rate | null> | undefined;
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
    if (!Array.isArray(texts) || texts.length > 80 || texts.some(text => typeof text !== 'string' || text.length > 6000) || !['zh-vi', 'vi-zh'].includes(direction)) throw new Error('Yêu cầu dịch không hợp lệ.');
    if (!texts.length) return [];
    const result = await offscreen({ action: 'translate-batch', texts, direction });
    if (result.ok) return result.data;
    const settled = await Promise.allSettled(texts.map(t => translate(t, direction)));
    if (settled.every(s => s.status === 'rejected') && settled.length > 0) {
      throw (settled[0] as PromiseRejectedResult).reason;
    }
    return settled.map((s, i) => s.status === 'fulfilled' ? s.value : texts[i]);
  }
  async function getRate(force = false) {
    if (rateRequest) return rateRequest;
    rateRequest = (async () => {
      const settings = await getSettings();
      const storage = localStorageArea();
      if (!storage) throw new AppError('STORAGE_UNAVAILABLE', 'Chrome chưa cung cấp bộ nhớ extension. Hãy tải lại extension tại chrome://extensions rồi tải lại trang.');
      const { rate: cached } = (await storage.get('rate')) as { rate?: Rate };
      const rate = await loadRate({ cached, manualRate: settings.manualRate, force });
      if (rate?.source === 'Frankfurter') await storage.set({ rate });
      return rate;
    })().finally(() => { rateRequest = undefined; });
    return rateRequest;
  }
  async function broadcast(type: string) {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(tabs.filter(tab => siteFor(tab.url || '')).map(tab => tab.id !== undefined ? chrome.tabs.sendMessage(tab.id, { type }) : Promise.resolve()));
  }
  function contentFiles() {
    return chrome.runtime.getManifest().content_scripts?.find(script => script.matches?.some(pattern => pattern.includes('taobao.com')))?.js || ['content-scripts/content.js'];
  }
  let syncingSites: Promise<void> = Promise.resolve();
  function syncSites() {
    syncingSites = syncingSites.catch(() => {}).then(async () => {
      const { enabled } = await getSettings();
      const desired: chrome.scripting.RegisteredContentScript[] = [];
      for (const [site, on] of Object.entries(enabled)) {
        const pattern = sitePattern(site);
        if (!on || isCommerceSite(site) || !pattern || !await chrome.permissions.contains({ origins: [pattern] })) continue;
        const id = 'tc-' + [...site].map(char => char.charCodeAt(0).toString(16)).join('');
        desired.push({ id, matches: [pattern], js: contentFiles(), runAt: 'document_idle', persistAcrossSessions: true });
      }
      const existing = (await chrome.scripting.getRegisteredContentScripts()).filter(script => script.id.startsWith('tc-'));
      const remove = existing.filter(script => !desired.some(next => next.id === script.id)).map(script => script.id);
      if (remove.length) await chrome.scripting.unregisterContentScripts({ ids: remove });
      const add = desired.filter(script => !existing.some(previous => previous.id === script.id));
      if (add.length) await chrome.scripting.registerContentScripts(add);
    });
    return syncingSites;
  }
  async function ensureTabScript(tabId: number) {
    try { const status = await chrome.tabs.sendMessage(tabId, { type: 'page-status' }); if (status) return; } catch { /* New tab or updated extension. */ }
    await chrome.scripting.executeScript({ target: { tabId }, files: contentFiles() });
  }
  async function startCapture(tabId: number, mode: 'region' | 'image') {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active || !siteFor(tab.url || '')) throw new Error('Mở một website HTTP/HTTPS đang xem để chọn ảnh.');
    await ensureTabScript(tabId);
    await chrome.storage.session.set({ [`capture:${tabId}`]: Date.now() + 120000 });
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
    if (tabId === undefined || !siteFor(sender.tab?.url || '')) throw new Error('Mở website đang xem để chọn ảnh.');
    const key = `capture:${tabId}`;
    const grant = await chrome.storage.session.get(key);
    await chrome.storage.session.remove(key);
    if (typeof grant[key] !== 'number' || grant[key] < Date.now()) throw new Error('Vùng chọn đã hết hạn. Bấm biểu tượng extension và chọn lại.');
    const currentTab = await chrome.tabs.get(tabId);
    const [active] = await chrome.tabs.query({ active: true, windowId: currentTab.windowId });
    if (active?.id !== tabId) throw new Error('Tab đã thay đổi. Hãy chọn lại vùng ảnh.');
    let image: string;
    try { image = await chrome.tabs.captureVisibleTab(currentTab.windowId, { format: 'png' }); }
    catch { throw new Error('Chrome cần quyền chụp tab: bấm biểu tượng extension trên thanh công cụ rồi chọn lại vùng ảnh.'); }
    const [after] = await chrome.tabs.query({ active: true, windowId: currentTab.windowId });
    if (after?.id !== tabId) throw new Error('Tab đã thay đổi trong lúc chụp. Ảnh đã được bỏ.');
    if (job) await cancelOcr();
    const current = { id: crypto.randomUUID(), tabId };
    job = current;
    await chrome.storage.session.set({ ocr: { jobId: current.id, tabId, state: 'working', progress: 0, expires: Date.now() + 5 * 60000 } });
    await chrome.alarms.create('clear-ocr', { delayInMinutes: 5 });
    const settings = await getSettings();
    void offscreen({ action: 'ocr', image, crop, jobId: current.id, language: settings.ocrLanguage }).then(async result => {
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
        case 'translate': case 'translate-batch': {
          if (!extensionUI) {
            const site = siteFor(sender.tab?.url || '')!;
            if (!(await getSettings()).enabled[site]) throw new AppError('SITE_DISABLED', 'Đã tắt dịch trên website này.');
          }
          return message.type === 'translate' ? translate(message.text, message.direction) : translateBatch((message as Extract<Request, { type: 'translate-batch' }>).texts, (message as Extract<Request, { type: 'translate-batch' }>).direction);
        }
        case 'get-state': return { settings: await getSettings(), rate: extensionUI || isCommerceSite(siteFor(sender.tab?.url || '')) ? await getRate() : null };
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
          if (next.ocrLanguage === 'chi_sim' || next.ocrLanguage === 'chi_tra') settings.ocrLanguage = next.ocrLanguage;
          if (typeof next.onlineFallback === 'boolean') {
            if (next.onlineFallback && !await chrome.permissions.contains({ origins: ['https://translate.googleapis.com/*'] })) throw new Error('Chưa cấp quyền dịch trực tuyến.');
            settings.onlineFallback = next.onlineFallback;
          }
          if (next.enabled) for (const [key, value] of Object.entries(next.enabled)) if (sitePattern(key) && typeof value === 'boolean') {
            if (value && !isCommerceSite(key) && !await chrome.permissions.contains({ origins: [sitePattern(key)!] })) throw new Error('Bấm Cho phép dịch trên website này để cấp quyền.');
            settings.enabled[key] = value;
          }
          const storage = localStorageArea();
          if (!storage) throw new AppError('STORAGE_UNAVAILABLE', 'Chrome chưa cung cấp bộ nhớ extension. Hãy tải lại extension tại chrome://extensions rồi tải lại trang.');
          await storage.set({ settings });
          await syncSites();
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
        case 'enable-site': {
          if (!extensionUI) throw new Error('Bật website từ bảng công cụ.');
          const tabId = (message as Extract<Request, { type: 'enable-site' }>).tabId;
          const tab = await chrome.tabs.get(tabId);
          const site = siteFor(tab.url || '');
          const pattern = site && sitePattern(site);
          if (!site || !pattern || !await chrome.permissions.contains({ origins: [pattern] })) throw new Error('Chưa cấp quyền cho website này.');
          const settings = await getSettings();
          settings.enabled[site] = true;
          const storage = localStorageArea();
          if (!storage) throw new AppError('STORAGE_UNAVAILABLE', 'Chrome chưa cung cấp bộ nhớ extension. Hãy tải lại extension tại chrome://extensions rồi tải lại trang.');
          await storage.set({ settings });
          await syncSites();
          await ensureTabScript(tabId);
          await chrome.tabs.sendMessage(tabId, { type: 'settings-updated' });
          return settings;
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
        case 'ocr-image': {
          const result = await offscreen({ action: 'ocr', image: (message as any).image, crop: null, jobId: crypto.randomUUID(), language: (message as any).language || 'chi_sim' });
          if (result.ok) return result.data;
          throw new Error(result.error);
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
    chrome.contextMenus.create({ id: 'tc-image', title: 'TranslateChina: Dịch chữ trong ảnh', contexts: ['image'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
    await syncSites();
    if (reason === 'install') await chrome.runtime.openOptionsPage();
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'tc-image' && tab?.id) {
      void chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      void new Promise(resolve => setTimeout(resolve, 300)).then(() => startCapture(tab.id!, 'image')).catch(async error => {
        await chrome.storage.session.set({ ocr: { state: 'error', error: errorMessage(error), expires: Date.now() + 5 * 60000 } });
      });
    }
  });
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'clear-ocr') void cancelOcr(); });
  chrome.tabs.onRemoved.addListener(tabId => { void chrome.storage.session.remove(`capture:${tabId}`); });
  chrome.runtime.onStartup.addListener(() => void syncSites());
  chrome.permissions.onRemoved.addListener(() => {
    void (async () => {
      const settings = await getSettings();
      for (const site of Object.keys(settings.enabled)) if (!isCommerceSite(site) && sitePattern(site) && !await chrome.permissions.contains({ origins: [sitePattern(site)!] })) settings.enabled[site] = false;
      if (!await chrome.permissions.contains({ origins: ['https://translate.googleapis.com/*'] })) settings.onlineFallback = false;
      const storage = localStorageArea();
      if (!storage) return;
      await storage.set({ settings });
      await syncSites();
      await broadcast('settings-updated');
    })();
  });
});
