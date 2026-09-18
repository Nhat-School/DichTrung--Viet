import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { request } from '../lib/messages';
import { TranslationEngine } from '../lib/translator';
import { splitText } from '../lib/text-chunks';
import { DEFAULT_SETTINGS, getSettings } from '../lib/storage';
import { AppError, errorMessage, isCommerceSite, isSiteEnabled, siteFor, sitePattern, type Direction, type EngineStatus, type OcrResult, type OcrState, type PageStatus, type PanelSize, type Rate, type Settings } from '../lib/types';

type Tab = 'page' | 'image' | 'write' | 'settings';
const availabilityLabels: Record<string, string> = { available: 'Sẵn sàng', downloadable: 'Cần tải gói ngôn ngữ', downloading: 'Đang tải…', unavailable: 'Chưa khả dụng', unsupported: 'Trình duyệt chưa hỗ trợ' };

function Brand({ online, size, onToggleSize }: { online: boolean; size?: PanelSize; onToggleSize?: () => void }) {
  const sizeLabel = size === 'micro' ? '240px' : size === 'mini' ? '275px' : size === 'compact' ? '320px' : '380px';
  return <header className="brand">
    <span className="brand-mark" aria-hidden="true">中<span>vi</span></span>
    <div><strong>TranslateChina</strong><span className="brand-caption">GLOBAL IS THE ONLY ONE</span></div>
    <div className="brand-actions">
      {onToggleSize && <button type="button" className="size-toggle-btn" title={`Đổi kích thước bảng (Hiện tại: ${sizeLabel}). Bấm để chuyển giữa 380px ↔ 320px ↔ 275px ↔ 240px.`} onClick={onToggleSize}>↔ {sizeLabel}</button>}
      <span className="local-tag"><i /> {online ? 'Có dịch trực tuyến' : 'Trên máy'}</span>
    </div>
  </header>;
}

export function App({ popup = false, initialTab = 'page' }: { popup?: boolean; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [rate, setRate] = useState<Rate | null>(null);
  const [active, setActive] = useState<chrome.tabs.Tab>();
  const [pageStatus, setPageStatus] = useState<PageStatus | null>(null);
  const [statuses, setStatuses] = useState<EngineStatus[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [manualRate, setManualRate] = useState('');
  const [initializing, setInitializing] = useState<Direction>();
  const [download, setDownload] = useState(0);
  const [purpose, setPurpose] = useState<'search' | 'message'>('search');
  const [searchInput, setSearchInput] = useState(() => {
    try { return sessionStorage.getItem('tc_search_input') || ''; } catch { return ''; }
  });
  const [searchOutput, setSearchOutput] = useState(() => {
    try { return sessionStorage.getItem('tc_search_output') || ''; } catch { return ''; }
  });
  const [searchWriting, setSearchWriting] = useState(false);
  const searchGeneration = useRef(0);

  const [messageInput, setMessageInput] = useState(() => {
    try { return sessionStorage.getItem('tc_message_input') || ''; } catch { return ''; }
  });
  const [messageOutput, setMessageOutput] = useState(() => {
    try { return sessionStorage.getItem('tc_message_output') || ''; } catch { return ''; }
  });
  const [messageWriting, setMessageWriting] = useState(false);
  const messageGeneration = useRef(0);

  useEffect(() => {
    try {
      sessionStorage.setItem('tc_search_input', searchInput);
      sessionStorage.setItem('tc_search_output', searchOutput);
    } catch {}
  }, [searchInput, searchOutput]);

  useEffect(() => {
    try {
      sessionStorage.setItem('tc_message_input', messageInput);
      sessionStorage.setItem('tc_message_output', messageOutput);
    } catch {}
  }, [messageInput, messageOutput]);
  const [ocr, setOcr] = useState<OcrState | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrTranslation, setOcrTranslation] = useState('');
  const [ocrTranslating, setOcrTranslating] = useState(false);
  const ocrGeneration = useRef(0);
  const engine = useMemo(() => new TranslationEngine(undefined, async () => (await getSettings()).onlineFallback), []);
  const site = active?.url ? siteFor(active.url) : undefined;

  const refreshTab = useCallback(async () => {
    const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
    setActive(current);
    if (current?.id && siteFor(current.url || '')) setPageStatus(await request<PageStatus | null>({ type: 'get-page-status', tabId: current.id }));
    else setPageStatus(null);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const state = await request<{ settings: Settings; rate: Rate | null }>({ type: 'get-state' });
      setSettings(state.settings); setRate(state.rate); setManualRate(state.settings.manualRate);
      setStatuses(await engine.status());
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, [engine]);

  useEffect(() => {
    void refresh(); void refreshTab();
    if (!popup) void request<OcrState | null>({ type: 'get-ocr' }).then(setOcr).catch(e => setError(errorMessage(e)));
    const tabsChanged = () => { void refreshTab().catch(() => {}); };
    chrome.tabs.onActivated.addListener(tabsChanged); chrome.tabs.onUpdated.addListener(tabsChanged);
    const storageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.settings) {
        const next = changes.settings.newValue as Settings | undefined;
        if (next) { setSettings(next); setManualRate(next.manualRate || ''); }
      }
      if (area === 'session' && changes.ocr && !popup) {
        setOcr((changes.ocr.newValue as OcrState) || null);
      }
    };
    chrome.storage?.onChanged?.addListener(storageChanged);
    return () => { chrome.tabs.onActivated.removeListener(tabsChanged); chrome.tabs.onUpdated.removeListener(tabsChanged); chrome.storage?.onChanged?.removeListener(storageChanged); };
  }, [popup, refresh, refreshTab]);

  useEffect(() => {
    if (popup) return;
    let port: chrome.runtime.Port | undefined, disposed = false, timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      if (disposed) return;
      port = chrome.runtime.connect({ name: 'visible-engine' });
      port.onMessage.addListener(async ({ id, text, direction }) => {
        try { port?.postMessage({ id, result: { ok: true, data: await engine.translate(text, direction) } }); }
        catch (e) { port?.postMessage({ id, result: { ok: false, error: errorMessage(e), code: e instanceof AppError ? e.code : 'ERROR' } }); }
      });
      port.onDisconnect.addListener(() => { if (!disposed) timer = setTimeout(connect, 1000); });
    };
    connect();
    return () => { disposed = true; clearTimeout(timer); port?.disconnect(); };
  }, [engine, popup]);

  useEffect(() => {
    ocrGeneration.current++;
    setOcrTranslating(false); setOcrText(ocr?.result?.text || ''); setOcrTranslation('');
    if (ocr?.state === 'done' || ocr?.state === 'working') setTab('image');
  }, [ocr?.jobId, ocr?.state]);

  async function updateSettings(next: Partial<Settings>) {
    setError('');
    try { const value = await request<Settings>({ type: 'set-settings', settings: next }); setSettings(value); setRate(await request<Rate | null>({ type: 'get-rate' })); void refreshTab(); }
    catch (e) { setError(errorMessage(e)); }
  }
  function enableSite() {
    if (!active?.id || !site) return;
    const pattern = sitePattern(site);
    if (!pattern) return;
    const tabId = active.id;
    setError('');
    void chrome.permissions.request({ origins: [pattern] }).then(async granted => {
      if (!granted) { setNotice('Chưa cấp quyền. Website chưa được bật dịch.'); return; }
      setSettings(await request<Settings>({ type: 'enable-site', tabId }));
      setNotice('Đã bật dịch cho website này. Các lần mở sau sẽ tự dịch.');
      await refreshTab();
    }).catch(e => setError(errorMessage(e)));
  }
  function setOnlineFallback(enabled: boolean) {
    void updateSettings({ onlineFallback: enabled });
  }
  async function refreshRate() {
    setRefreshing(true); setError('');
    try { const value = await request<Rate | null>({ type: 'get-rate', force: true }); setRate(value); if (!value) setError('Chưa lấy được tỷ giá. Thử lại hoặc nhập tỷ giá riêng trong Thiết lập.'); }
    catch (e) { setError(errorMessage(e)); } finally { setRefreshing(false); }
  }
  function openPanel() {
    if (!active?.id) return;
    void chrome.sidePanel.open({ tabId: active.id }).then(() => { if (popup) window.close(); }).catch(e => setError(errorMessage(e)));
  }
  function capture(mode: 'region' | 'image') {
    if (!active?.id || !site) { setError('Mở website rồi bấm biểu tượng extension để chọn vùng ảnh.'); return; }
    setError('');
    const tabId = active.id;
    // Call open synchronously in the click handler so Chrome sees the gesture.
    const panel = popup ? chrome.sidePanel.open({ tabId }) : Promise.resolve();
    void panel.then(() => new Promise(resolve => setTimeout(resolve, 250))).then(() => request({ type: 'start-capture', tabId, mode }))
      .then(() => { if (popup) window.close(); else setTab('image'); }).catch(e => setError(errorMessage(e)));
  }
  function initialize(direction: Direction) {
    setError(''); setInitializing(direction); setDownload(0);
    // The initial create call must happen in this user gesture, not after a message.
    void engine.initialize(direction, setDownload).then(async () => {
      setStatuses(await engine.status()); setNotice('Bộ dịch đã sẵn sàng. Quay lại trang web hoặc tải lại trang.');
    }).catch(e => setError(errorMessage(e))).finally(() => setInitializing(undefined));
  }
  async function translateSearch(customText?: string) {
    const text = (customText !== undefined ? customText : searchInput).trim();
    if (!text) return;
    const generation = ++searchGeneration.current;
    setSearchWriting(true); setSearchOutput(''); setError('');
    try {
      const result = await request<string>({ type: 'translate', text, direction: 'vi-zh' });
      if (generation === searchGeneration.current) setSearchOutput(result);
    } catch (e) {
      if (generation === searchGeneration.current) setError(errorMessage(e));
    } finally {
      if (generation === searchGeneration.current) setSearchWriting(false);
    }
  }

  async function translateMessage(customText?: string) {
    const text = (customText !== undefined ? customText : messageInput).trim();
    if (!text) return;
    const generation = ++messageGeneration.current;
    setMessageWriting(true); setMessageOutput(''); setError('');
    try {
      const result = await request<string>({ type: 'translate', text, direction: 'vi-zh' });
      if (generation === messageGeneration.current) setMessageOutput(result);
    } catch (e) {
      if (generation === messageGeneration.current) setError(errorMessage(e));
    } finally {
      if (generation === messageGeneration.current) setMessageWriting(false);
    }
  }

  const SELLER_TEMPLATES = [
    { label: '📦 Còn hàng không?', text: 'Xin chào, sản phẩm này còn hàng sẵn không?' },
    { label: '🚚 Khi nào giao hàng?', text: 'Xin chào, sau khi đặt đơn thì bao lâu shop có thể giao hàng?' },
    { label: '💰 Số lượng nhiều có giảm giá?', text: 'Tôi muốn đặt số lượng nhiều, shop có thể chiết khấu thêm không?' },
    { label: '🏷️ Có hỗ trợ freeship?', text: 'Đơn hàng này có được hỗ trợ phí vận chuyển (freeship) không?' },
    { label: '📏 Tư vấn chọn size', text: 'Tôi cao 1m65, nặng 55kg thì nên chọn size nào vừa vặn?' },
    { label: '📸 Cho xem ảnh thật', text: 'Shop có thể gửi thêm ảnh chụp thật của sản phẩm được không?' },
    { label: '🧪 Muốn lấy mẫu thử', text: 'Tôi muốn đặt 1 chiếc mẫu thử trước có được không?' },
    { label: '⏱️ Đang cần gấp', text: 'Đơn này tôi đang cần gấp, shop vui lòng ưu tiên đóng gói và gửi sớm giúp tôi nhé.' },
  ];

  const SEARCH_SUGGESTIONS = [
    'Áo thun nữ dáng rộng',
    'Giày thể thao trắng',
    'Túi xách đeo chéo nữ',
    'Ốp lưng điện thoại',
    'Đồ gia dụng thông minh',
    'Váy đầm dự tiệc',
    'Quần jean ống suông',
    'Bình giữ nhiệt inox',
  ];

  async function translateOcr() {
    const generation = ++ocrGeneration.current;
    setOcrTranslating(true); setError(''); setOcrTranslation('');
    try {
      const chunks = splitText(ocrText);
      const output: string[] = [];
      for (const chunk of chunks) {
        if (generation !== ocrGeneration.current) return;
        output.push(await request<string>({ type: 'translate', text: chunk, direction: 'zh-vi' }));
      }
      if (generation === ocrGeneration.current) setOcrTranslation(output.join('\n'));
    } catch (e) { if (generation === ocrGeneration.current) setError(errorMessage(e)); }
    finally { if (generation === ocrGeneration.current) setOcrTranslating(false); }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice('Đã sao chép.'); } catch { setError('Chưa sao chép được. Hãy chọn văn bản và dùng Ctrl/Cmd+C.'); }
  }

  function toggleSize() {
    const current = settings.panelSize || 'standard';
    const next: PanelSize = current === 'standard' ? 'compact' : current === 'compact' ? 'mini' : current === 'mini' ? 'micro' : 'standard';
    void updateSettings({ panelSize: next });
  }

  const rateCard = <section className="rate-card" aria-label="Tỷ giá CNY sang VNĐ">
    <div className="row"><span className="eyebrow">QUY ĐỔI THAM KHẢO</span><button className="icon-button" aria-label="Cập nhật tỷ giá" disabled={refreshing || !!settings.manualRate} onClick={refreshRate}>{refreshing ? '…' : '↻'}</button></div>
    <div className="exchange"><span>1 <small>CNY</small></span><span className="exchange-arrow">→</span><strong>{rate ? Number(rate.rate).toLocaleString('vi-VN', { maximumFractionDigits: 6 }) : '—'} <small>VNĐ</small></strong></div>
    <div className="rate-meta">{rate ? rate.source === 'manual' ? 'Đang dùng tỷ giá bạn nhập' : `Frankfurter · ngày ${rate.date.split('-').reverse().join('/')}` : loading ? 'Đang lấy tỷ giá…' : 'Chưa có tỷ giá · thử cập nhật hoặc nhập riêng'}</div>
    {rate?.source === 'Frankfurter' && <div className="rate-meta">Kiểm tra: {new Date(rate.fetchedAt).toLocaleString('vi-VN')}</div>}
    {rate?.stale && <p className="warning inline">{rate.error || 'Nguồn đang cung cấp tỷ giá cũ. Hãy kiểm tra ngày dữ liệu.'}</p>}
  </section>;

  const panelSize = settings.panelSize || 'standard';

  return <div className={`app ${popup ? 'popup' : ''} size-${panelSize}`}>
    <Brand online={settings.onlineFallback} size={panelSize} onToggleSize={toggleSize} />
    <main>
      <div className="intro"><span className="eyebrow">TRUNG → VIỆT · GLOBAL IS THE ONLY ONE</span><h1>Global is<br /><em>the only one.</em></h1><p>Đọc web tiếng Trung. Global is the only one.</p><span className="intro-glyph" aria-hidden="true">译</span></div>
      {!popup && <nav aria-label="Công cụ">{([['page', 'Trang web'], ['image', 'Dịch ảnh'], ['write', 'Tìm & nhắn'], ['settings', 'Thiết lập']] as [Tab, string][]).map(([id, label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => { setTab(id); setError(''); setNotice(''); }}>{label}</button>)}</nav>}
      {error && <div className="message error" role="alert">{error}<button className="dismiss" aria-label="Đóng lỗi" onClick={() => setError('')}>×</button></div>}
      {notice && <div className="message success" role="status">{notice}<button className="dismiss" aria-label="Đóng thông báo" onClick={() => setNotice('')}>×</button></div>}

      {(popup || tab === 'page') && <>
        <section className="site-card"><div className="row"><div><span className="eyebrow">TRANG ĐANG XEM</span><h2>{site ? site === 'taobao' ? 'Taobao' : site === '1688' ? '1688' : new URL(site).hostname : 'Mở một website'}</h2></div>{site && <label className="switch"><input type="checkbox" aria-label={`Tự dịch ${site}`} checked={isSiteEnabled(settings, site)} onChange={event => { void updateSettings({ enabled: { ...settings.enabled, [site]: event.target.checked } }); }} /><span /></label>}</div><p className="muted">{site ? isSiteEnabled(settings, site) ? isCommerceSite(site) ? 'Dịch sang tiếng Việt và hiển thị giá VNĐ.' : 'Tự dịch chữ tiếng Trung trên website này.' : 'Đang xem bản gốc. Bật lại khi cần dịch.' : 'Mở website HTTP/HTTPS cần dịch rồi bấm biểu tượng extension.'}</p>
          {pageStatus?.error && (
            <div className="warning">
              <div>{pageStatus.error}</div>
              {pageStatus.error.includes('Thiết lập') && (
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" className="secondary compact" onClick={() => setTab('settings')}>
                    Mở Thiết lập ⚙️
                  </button>
                  {!settings.onlineFallback && (
                    <button type="button" className="secondary compact" onClick={() => setOnlineFallback(true)}>
                      🌐 Bật Google Dịch dự phòng
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {site && pageStatus && <div className="status-line"><i />{pageStatus.translated} đoạn đã dịch {pageStatus.pending > 0 ? '· Đang xử lý…' : ''}</div>}
          {site && isSiteEnabled(settings, site) && !pageStatus && <p className="warning">Tải lại trang sau khi cài hoặc cập nhật extension.</p>}
        </section>
        {isCommerceSite(site) && rateCard}
        <section><div className="section-heading"><h2>Chữ nằm trong ảnh?</h2><span className="pill">OCR</span></div><p className="muted">Chọn phần đang thấy trên màn hình để đọc bằng tiếng Việt.</p><div className="two-buttons"><button className="secondary" disabled={!site} onClick={() => capture('region')}>⌗ Khoanh vùng</button><button className="secondary" disabled={!site} onClick={() => capture('image')}>▧ Chọn ảnh</button></div></section>
        {popup ? <button className="primary full" onClick={openPanel}>Mở bảng công cụ <span>↗</span></button> : <div className="note">Rê chuột lên đoạn đã dịch để xem bản gốc. Tắt công tắc để phục hồi nguyên văn trên website này.</div>}
      </>}

      {!popup && tab === 'image' && <>
        <div className="section-heading"><h2>Đọc chữ trong ảnh</h2><span className="pill">Trên máy</span></div>
        <p className="muted">Khoanh sát phần chữ để đọc chính xác hơn; tránh chọn cả ảnh sản phẩm nếu chữ quá nhỏ. Ảnh dài chỉ lấy phần trong màn hình.</p><label className="field">Kiểu chữ trong ảnh<select value={settings.ocrLanguage || 'chi_sim'} onChange={event => void updateSettings({ ocrLanguage: event.target.value as 'chi_sim' | 'chi_tra' })}><option value="chi_sim">Trung giản thể · Taobao, 1688</option><option value="chi_tra">Trung phồn thể · Đài Loan, Hong Kong</option></select></label>
        <div className="two-buttons"><button className="secondary" onClick={() => capture('region')}>⌗ Khoanh vùng</button><button className="secondary" onClick={() => capture('image')}>▧ Chọn ảnh</button></div>
        {!ocr && <div className="empty-state"><span>文 → A</span><h3>Một vùng ảnh, rõ nghĩa hơn.</h3><p>Bấm biểu tượng extension trên tab đang xem để cấp quyền chụp, rồi chọn vùng chữ.</p></div>}
        {ocr?.state === 'working' && <section className="work-card" aria-live="polite"><h3>{ocr.status || 'Đang nhận diện chữ…'}</h3><progress max="1" value={ocr.progress || 0} /><p className="muted">Lần đầu cần khởi tạo bộ nhận diện trên máy.</p><button className="secondary" onClick={() => void request({ type: 'cancel-ocr' }).catch(e => setError(errorMessage(e)))}>Hủy nhận diện</button></section>}
        {ocr?.state === 'error' && <p className="message error" role="alert">{ocr.error}</p>}
        {ocr?.result && <>
          <img className="ocr-preview" src={ocr.result.image} alt="Vùng ảnh vừa chọn để nhận diện" />
          {!ocr.result.text ? <p className="warning">Chưa tìm được chữ rõ ràng. Hãy khoanh sát phần chữ hoặc phóng to ảnh rồi thử lại.</p> : <p className="note">Đã đọc {ocr.result.lines?.length || 'các'} dòng. Đối chiếu với ảnh trước khi dịch: OCR vẫn có thể nhầm ký tự dù không báo lỗi.</p>}
          {(ocr.result.lines || []).some(line => line.confidence < 65) && <div className="warning">Dòng cần kiểm tra kỹ: {(ocr.result.lines || []).filter(line => line.confidence < 65).map(line => line.text).join(' · ')}</div>}
          <label className="field">Chữ nhận diện · có thể sửa<textarea value={ocrText} onChange={e => { ocrGeneration.current++; setOcrTranslating(false); setOcrText(e.target.value); setOcrTranslation(''); }} rows={6} /></label>
          <button className="primary full" disabled={!ocrText.trim() || ocrTranslating} onClick={translateOcr}>{ocrTranslating ? 'Đang dịch…' : 'Dịch sang tiếng Việt'}</button>
          {ocrTranslation && <div className="translation-result"><div className="row"><span className="eyebrow">TIẾNG VIỆT</span><button className="text-button" onClick={() => void copy(ocrTranslation)}>Sao chép</button></div><p>{ocrTranslation}</p></div>}
          <button className="text-button" onClick={() => void request({ type: 'clear-ocr' }).catch(e => setError(errorMessage(e)))}>Xóa ảnh và kết quả</button><p className="small muted">Ảnh và kết quả nhận diện tự xóa sau 5 phút.</p>
        </>}
      </>}

      {!popup && tab === 'write' && <>
        <div className="section-heading"><h2>Viết bằng tiếng Việt</h2><span className="pill">Việt → Trung</span></div>
        <div className="segmented">
          <button className={purpose === 'search' ? 'active' : ''} onClick={() => setPurpose('search')}>
            🔍 Tìm kiếm {searchInput.trim() ? '•' : ''}
          </button>
          <button className={purpose === 'message' ? 'active' : ''} onClick={() => setPurpose('message')}>
            💬 Nhắn người bán {messageInput.trim() ? '•' : ''}
          </button>
        </div>

        {purpose === 'search' && <>
          <p className="muted">Mô tả sản phẩm bạn muốn tìm. Ô này lưu riêng từ khóa tìm kiếm để không bị lẫn với tin nhắn shop.</p>
          <div className="quick-group">
            <span className="eyebrow">TỪ KHÓA GỢI Ý MẪU</span>
            <div className="quick-templates">
              {SEARCH_SUGGESTIONS.map(item => (
                <button
                  key={item}
                  type="button"
                  className="quick-chip"
                  onClick={() => {
                    setSearchInput(item);
                    void translateSearch(item);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            Từ khóa sản phẩm (Tiếng Việt)
            <textarea
              maxLength={6000}
              value={searchInput}
              onChange={e => {
                searchGeneration.current++;
                setSearchWriting(false);
                setSearchInput(e.target.value);
                setSearchOutput('');
              }}
              placeholder="Ví dụ: áo sơ mi nữ vải cotton màu trắng, ốp điện thoại iphone 15..."
              rows={5}
            />
          </label>
          <div className="counter">{searchInput.length.toLocaleString('vi-VN')} / 6.000</div>
          <button
            className="primary full"
            onClick={() => void translateSearch()}
            disabled={!searchInput.trim() || searchWriting}
          >
            {searchWriting ? 'Đang dịch…' : '🔍 Dịch từ khóa tìm kiếm'}
          </button>
          {searchOutput && (
            <div className="translation-result">
              <div className="row">
                <span className="eyebrow">TỪ KHÓA TÌM KIẾM (TIẾNG TRUNG)</span>
                <button className="text-button" onClick={() => void copy(searchOutput)}>Sao chép</button>
              </div>
              <p lang="zh">{searchOutput}</p>
              <div className="result-tip">💡 Mẹo: Dán trực tiếp vào ô tìm kiếm trên Taobao hoặc 1688 để tìm nguồn hàng gốc.</div>
            </div>
          )}
        </>}

        {purpose === 'message' && <>
          <p className="muted">Soạn câu hỏi hoặc lời nhắn gửi cho shop. Ô này lưu riêng tin nhắn trao đổi, độc lập với từ khóa tìm kiếm.</p>
          <div className="quick-group">
            <span className="eyebrow">MẪU CÂU HỎI SHOP THÔNG DỤNG (BẤM ĐỂ DỊCH NHANH)</span>
            <div className="quick-templates">
              {SELLER_TEMPLATES.map(item => (
                <button
                  key={item.label}
                  type="button"
                  className="quick-chip"
                  onClick={() => {
                    setMessageInput(item.text);
                    void translateMessage(item.text);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            Nội dung nhắn cho shop (Tiếng Việt)
            <textarea
              maxLength={6000}
              value={messageInput}
              onChange={e => {
                messageGeneration.current++;
                setMessageWriting(false);
                setMessageInput(e.target.value);
                setMessageOutput('');
              }}
              placeholder="Ví dụ: Xin chào, sản phẩm này còn hàng không? Tôi muốn mua 20 chiếc..."
              rows={5}
            />
          </label>
          <div className="counter">{messageInput.length.toLocaleString('vi-VN')} / 6.000</div>
          <button
            className="primary full"
            onClick={() => void translateMessage()}
            disabled={!messageInput.trim() || messageWriting}
          >
            {messageWriting ? 'Đang dịch…' : '💬 Dịch lời nhắn cho shop'}
          </button>
          {messageOutput && (
            <div className="translation-result">
              <div className="row">
                <span className="eyebrow">LỜI NHẮN GỬI SHOP (TIẾNG TRUNG)</span>
                <button className="text-button" onClick={() => void copy(messageOutput)}>Sao chép</button>
              </div>
              <p lang="zh">{messageOutput}</p>
              <div className="result-tip">💡 Mẹo: Mở ô chat AliWangWang (旺旺) trên Taobao/1688 rồi dán câu này để nhắn trực tiếp cho shop.</div>
            </div>
          )}
        </>}
      </>}

      {!popup && tab === 'settings' && <>
        <div className="section-heading"><h2>Bắt đầu miễn phí</h2><span className="pill">Không API key</span></div><p className="muted">Tải gói ngôn ngữ một lần bằng Chrome. Sau đó việc dịch diễn ra ngay trên thiết bị.</p>
        {(['zh-vi', 'vi-zh'] as Direction[]).map(direction => <section className="model-card" key={direction}><div className="row"><div><h3>{direction === 'zh-vi' ? 'Trung → Việt' : 'Việt → Trung'}</h3><p className="muted small">{availabilityLabels[statuses.find(s => s.direction === direction)?.state || ''] || 'Đang kiểm tra…'}</p></div><button className="secondary compact" disabled={!!initializing} onClick={() => initialize(direction)}>{initializing === direction ? 'Đang tải…' : 'Khởi tạo'}</button></div>{initializing === direction && <progress max="1" value={download} />}</section>)}
        <p className="note">Nếu Chrome cần giao diện đang mở để dịch, hãy giữ bảng công cụ này mở. Khi gặp lỗi, thử khởi tạo lại rồi quay về trang web.</p>
        <section>
          <h2>Kích thước bảng công cụ</h2>
          <p className="muted">Tùy chỉnh độ rộng mặc định khi mở popup hoặc sidepanel.</p>
          <label className="field">
            Độ rộng bảng
            <select value={settings.panelSize || 'standard'} onChange={e => void updateSettings({ panelSize: e.target.value as PanelSize })}>
              <option value="standard">Tiêu chuẩn · 380px (Đầy đủ và dễ nhìn nhất)</option>
              <option value="compact">Gọn vừa · 320px</option>
              <option value="mini">Nhỏ gọn · 275px</option>
              <option value="micro">Siêu nhỏ · 240px (Tiết kiệm màn hình)</option>
            </select>
          </label>
        </section>
        <section>
          <h2>Tự động dịch website</h2>
          <p className="muted">Áp dụng cho mọi website có chữ tiếng Trung.</p>
          <label className="setting-row">
            <span>Tự động dịch mọi website tiếng Trung</span>
            <input
              type="checkbox"
              checked={settings.autoTranslateAll ?? true}
              onChange={e => void updateSettings({ autoTranslateAll: e.target.checked })}
            />
          </label>
          {Object.keys(settings.enabled).length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <p className="muted small">Tùy chọn bật/tắt riêng từng website:</p>
              {Object.keys(settings.enabled).map(name => (
                <label className="setting-row" key={name}>
                  <span>{name === 'taobao' ? 'Taobao' : name === '1688' ? '1688' : name.replace(/^https?:\/\//, '')}</span>
                  <input
                    type="checkbox"
                    checked={isSiteEnabled(settings, name)}
                    onChange={e => void updateSettings({ enabled: { ...settings.enabled, [name]: e.target.checked } })}
                  />
                </label>
              ))}
            </div>
          )}
        </section>
        {rateCard}
        <section><h2>Tỷ giá riêng</h2><p className="muted">Nhập số VNĐ cho 1 CNY nếu bạn có tỷ giá riêng. Bỏ trống để dùng nguồn tự động.</p><label className="field">1 CNY =<div className="input-unit"><input inputMode="decimal" placeholder="Ví dụ 3870.34" value={manualRate} onChange={e => setManualRate(e.target.value)} /><span>VNĐ</span></div></label><div className="two-buttons"><button className="secondary" onClick={() => void updateSettings({ manualRate })}>Lưu tỷ giá</button><button className="text-button" onClick={() => { setManualRate(''); void updateSettings({ manualRate: '' }); }}>Dùng tự động</button></div></section>
        <section className="privacy"><h3>Bạn quyết định nơi dịch</h3><p>Mặc định dịch và nhận diện ảnh trên máy. Không tài khoản, quảng cáo hay theo dõi. Nếu bật dịch trực tuyến bên dưới, văn bản cần dịch có thể được gửi tới Google. Ảnh luôn nhận diện trên máy. Giá VNĐ là ước tính.</p><label className="setting-row"><span>Cho phép Google dịch khi bộ dịch trên máy chưa sẵn sàng</span><input type="checkbox" checked={settings.onlineFallback} onChange={event => setOnlineFallback(event.target.checked)} /></label><p>Tùy chọn miễn phí, không API key; nguồn trực tuyến không chính thức có thể bị giới hạn hoặc ngừng hoạt động.</p><p>Tỷ giá theo ngày. Bản dịch máy và chữ trong ảnh luôn cần đối chiếu khi thông tin chưa rõ.</p></section>
      </>}
      <footer><span>Miễn phí · Không tài khoản</span><button className="text-button" onClick={() => void chrome.runtime.openOptionsPage()}>Thiết lập ↗</button></footer>
    </main>
  </div>;
}
