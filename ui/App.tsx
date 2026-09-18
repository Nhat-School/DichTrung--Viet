import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { request } from '../lib/messages';
import { TranslationEngine } from '../lib/translator';
import { DEFAULT_SETTINGS } from '../lib/storage';
import { AppError, errorMessage, siteFor, type Direction, type EngineStatus, type OcrResult, type PageStatus, type Rate, type Settings } from '../lib/types';

type Tab = 'page' | 'image' | 'write' | 'settings';
interface OcrState { state: 'working' | 'done' | 'error'; progress?: number; result?: OcrResult; error?: string; jobId?: string; expires: number; }
const availabilityLabels: Record<string, string> = { available: 'Sẵn sàng', downloadable: 'Cần tải gói ngôn ngữ', downloading: 'Đang tải…', unavailable: 'Chưa khả dụng', unsupported: 'Trình duyệt chưa hỗ trợ' };

function Brand() {
  return <header className="brand"><span className="brand-mark" aria-hidden="true">中<span>vi</span></span><div><strong>TranslateChina</strong><span className="brand-caption">HIỂU RÕ TRƯỚC KHI MUA</span></div><span className="local-tag"><i /> Trên máy</span></header>;
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
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [writing, setWriting] = useState(false);
  const [purpose, setPurpose] = useState<'search' | 'message'>('search');
  const [ocr, setOcr] = useState<OcrState | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrTranslation, setOcrTranslation] = useState('');
  const [ocrTranslating, setOcrTranslating] = useState(false);
  const writingGeneration = useRef(0);
  const ocrGeneration = useRef(0);
  const engine = useMemo(() => new TranslationEngine(), []);
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
    chrome.storage.onChanged.addListener(storageChanged);
    return () => { chrome.tabs.onActivated.removeListener(tabsChanged); chrome.tabs.onUpdated.removeListener(tabsChanged); chrome.storage.onChanged.removeListener(storageChanged); };
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
    if (!active?.id || !site) { setError('Mở Taobao hoặc 1688 rồi bấm biểu tượng extension để chọn vùng ảnh.'); return; }
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
      setStatuses(await engine.status()); setNotice('Bộ dịch đã sẵn sàng. Quay lại trang mua hàng hoặc tải lại trang.');
    }).catch(e => setError(errorMessage(e))).finally(() => setInitializing(undefined));
  }
  async function translateInput() {
    if (!input.trim()) return;
    const generation = ++writingGeneration.current;
    setWriting(true); setOutput(''); setError('');
    try { const result = await request<string>({ type: 'translate', text: input, direction: 'vi-zh' }); if (generation === writingGeneration.current) setOutput(result); }
    catch (e) { if (generation === writingGeneration.current) setError(errorMessage(e)); }
    finally { if (generation === writingGeneration.current) setWriting(false); }
  }
  async function translateOcr() {
    const generation = ++ocrGeneration.current;
    setOcrTranslating(true); setError(''); setOcrTranslation('');
    try {
      const chunks = ocrText.match(/[\s\S]{1,1800}(?:\n|$)|[\s\S]{1,1800}/g) || [];
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

  const rateCard = <section className="rate-card" aria-label="Tỷ giá CNY sang VNĐ">
    <div className="row"><span className="eyebrow">QUY ĐỔI THAM KHẢO</span><button className="icon-button" aria-label="Cập nhật tỷ giá" disabled={refreshing || !!settings.manualRate} onClick={refreshRate}>{refreshing ? '…' : '↻'}</button></div>
    <div className="exchange"><span>1 <small>CNY</small></span><span className="exchange-arrow">→</span><strong>{rate ? Number(rate.rate).toLocaleString('vi-VN', { maximumFractionDigits: 6 }) : '—'} <small>VNĐ</small></strong></div>
    <div className="rate-meta">{rate ? rate.source === 'manual' ? 'Đang dùng tỷ giá bạn nhập' : `Frankfurter · ngày ${rate.date.split('-').reverse().join('/')}` : loading ? 'Đang lấy tỷ giá…' : 'Chưa có tỷ giá · thử cập nhật hoặc nhập riêng'}</div>
    {rate?.source === 'Frankfurter' && <div className="rate-meta">Kiểm tra: {new Date(rate.fetchedAt).toLocaleString('vi-VN')}</div>}
    {rate?.stale && <p className="warning inline">{rate.error || 'Nguồn đang cung cấp tỷ giá cũ. Hãy kiểm tra ngày dữ liệu.'}</p>}
  </section>;

  return <div className={`app ${popup ? 'popup' : ''}`}>
    <Brand />
    <main>
      <div className="intro"><span className="eyebrow">TAOBAO & 1688</span><h1>Mua hàng,<br /><em>hiểu rõ.</em></h1><p>Tiếng Việt trên trang. Giá quy đổi trong tầm mắt.</p><span className="intro-glyph" aria-hidden="true">译</span></div>
      {!popup && <nav aria-label="Công cụ">{([['page', 'Trang web'], ['image', 'Dịch ảnh'], ['write', 'Tìm & nhắn'], ['settings', 'Thiết lập']] as [Tab, string][]).map(([id, label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => { setTab(id); setError(''); setNotice(''); }}>{label}</button>)}</nav>}
      {error && <div className="message error" role="alert">{error}<button className="dismiss" aria-label="Đóng lỗi" onClick={() => setError('')}>×</button></div>}
      {notice && <div className="message success" role="status">{notice}<button className="dismiss" aria-label="Đóng thông báo" onClick={() => setNotice('')}>×</button></div>}

      {(popup || tab === 'page') && <>
        <section className="site-card"><div className="row"><div><span className="eyebrow">TRANG ĐANG XEM</span><h2>{site ? site === 'taobao' ? 'Taobao' : '1688' : 'Mở một trang mua hàng'}</h2></div>{site && <label className="switch"><input type="checkbox" aria-label={`Tự dịch ${site}`} checked={settings.enabled[site]} onChange={event => void updateSettings({ enabled: { ...settings.enabled, [site]: event.target.checked } })} /><span /></label>}</div><p className="muted">{site ? settings.enabled[site] ? 'Dịch sang tiếng Việt và hiển thị giá VNĐ.' : 'Đang xem bản gốc. Bật lại khi cần dịch.' : 'Công cụ tự hoạt động trên Taobao và 1688.'}</p>
          {pageStatus?.error && <p className="warning">{pageStatus.error}</p>}
          {site && pageStatus && <div className="status-line"><i />{pageStatus.translated} đoạn đã dịch {pageStatus.pending > 0 ? '· Đang xử lý…' : ''}</div>}
          {site && !pageStatus && <p className="warning">Tải lại trang mua hàng sau khi cài hoặc cập nhật extension.</p>}
        </section>
        {rateCard}
        <section><div className="section-heading"><h2>Chữ nằm trong ảnh?</h2><span className="pill">OCR</span></div><p className="muted">Chọn phần đang thấy trên màn hình để đọc bằng tiếng Việt.</p><div className="two-buttons"><button className="secondary" disabled={!site} onClick={() => capture('region')}>⌗ Khoanh vùng</button><button className="secondary" disabled={!site} onClick={() => capture('image')}>▧ Chọn ảnh</button></div></section>
        {popup ? <button className="primary full" onClick={openPanel}>Mở bảng công cụ <span>↗</span></button> : <div className="note">Rê chuột lên đoạn đã dịch để xem bản gốc. Tắt công tắc để phục hồi nguyên văn trên website này.</div>}
      </>}

      {!popup && tab === 'image' && <>
        <div className="section-heading"><h2>Đọc chữ trong ảnh</h2><span className="pill">Trên máy</span></div>
        <p className="muted">Khoanh vùng chữ hoặc bấm ảnh đang thấy. Ảnh dài chỉ lấy phần trong màn hình.</p>
        <div className="two-buttons"><button className="secondary" onClick={() => capture('region')}>⌗ Khoanh vùng</button><button className="secondary" onClick={() => capture('image')}>▧ Chọn ảnh</button></div>
        {!ocr && <div className="empty-state"><span>文 → A</span><h3>Một vùng ảnh, rõ nghĩa hơn.</h3><p>Bấm biểu tượng extension trên tab mua hàng để cấp quyền chụp, rồi chọn vùng chữ.</p></div>}
        {ocr?.state === 'working' && <section className="work-card" aria-live="polite"><h3>Đang nhận diện chữ…</h3><progress max="1" value={ocr.progress || 0} /><p className="muted">Lần đầu cần khởi tạo bộ nhận diện trên máy.</p><button className="secondary" onClick={() => void request({ type: 'cancel-ocr' }).catch(e => setError(errorMessage(e)))}>Hủy nhận diện</button></section>}
        {ocr?.state === 'error' && <p className="message error" role="alert">{ocr.error}</p>}
        {ocr?.result && <>
          <img className="ocr-preview" src={ocr.result.image} alt="Vùng ảnh vừa chọn để nhận diện" />
          {(ocr.result.confidence < 65 || !ocr.result.text) && <p className="warning">Ảnh khó đọc hoặc chưa tìm được chữ. Kiểm tra phần nhận diện; bạn có thể sửa hoặc chọn vùng rõ hơn.</p>}
          <label className="field">Chữ nhận diện · có thể sửa<textarea value={ocrText} onChange={e => { ocrGeneration.current++; setOcrTranslating(false); setOcrText(e.target.value); setOcrTranslation(''); }} rows={6} /></label>
          <button className="primary full" disabled={!ocrText.trim() || ocrTranslating} onClick={translateOcr}>{ocrTranslating ? 'Đang dịch…' : 'Dịch sang tiếng Việt'}</button>
          {ocrTranslation && <div className="translation-result"><div className="row"><span className="eyebrow">TIẾNG VIỆT</span><button className="text-button" onClick={() => void copy(ocrTranslation)}>Sao chép</button></div><p>{ocrTranslation}</p></div>}
          <button className="text-button" onClick={() => void request({ type: 'clear-ocr' }).catch(e => setError(errorMessage(e)))}>Xóa ảnh và kết quả</button><p className="small muted">Ảnh và kết quả nhận diện tự xóa sau 5 phút.</p>
        </>}
      </>}

      {!popup && tab === 'write' && <>
        <div className="section-heading"><h2>Viết bằng tiếng Việt</h2><span className="pill">Việt → Trung</span></div>
        <div className="segmented"><button className={purpose === 'search' ? 'active' : ''} onClick={() => setPurpose('search')}>Tìm hàng</button><button className={purpose === 'message' ? 'active' : ''} onClick={() => setPurpose('message')}>Nhắn người bán</button></div>
        <p className="muted">{purpose === 'search' ? 'Mô tả món hàng bạn muốn tìm. Sao chép bản dịch vào ô tìm kiếm của website.' : 'Soạn lời nhắn, kiểm tra bản dịch rồi tự gửi cho người bán.'}</p>
        <label className="field">Nội dung tiếng Việt<textarea maxLength={6000} value={input} onChange={e => { writingGeneration.current++; setWriting(false); setInput(e.target.value); setOutput(''); }} placeholder={purpose === 'search' ? 'Ví dụ: áo sơ mi nữ vải cotton màu trắng' : 'Ví dụ: Sản phẩm này còn hàng không? Tôi muốn mua 20 chiếc.'} rows={6} /></label>
        <div className="counter">{input.length.toLocaleString('vi-VN')} / 6.000</div>
        <button className="primary full" onClick={translateInput} disabled={!input.trim() || writing}>{writing ? 'Đang dịch…' : 'Dịch sang tiếng Trung'}</button>
        {output && <div className="translation-result"><div className="row"><span className="eyebrow">TIẾNG TRUNG</span><button className="text-button" onClick={() => void copy(output)}>Sao chép</button></div><p lang="zh">{output}</p></div>}
      </>}

      {!popup && tab === 'settings' && <>
        <div className="section-heading"><h2>Bắt đầu miễn phí</h2><span className="pill">Không API key</span></div><p className="muted">Tải gói ngôn ngữ một lần bằng Chrome. Sau đó việc dịch diễn ra ngay trên thiết bị.</p>
        {(['zh-vi', 'vi-zh'] as Direction[]).map(direction => <section className="model-card" key={direction}><div className="row"><div><h3>{direction === 'zh-vi' ? 'Trung → Việt' : 'Việt → Trung'}</h3><p className="muted small">{availabilityLabels[statuses.find(s => s.direction === direction)?.state || ''] || 'Đang kiểm tra…'}</p></div><button className="secondary compact" disabled={!!initializing} onClick={() => initialize(direction)}>{initializing === direction ? 'Đang tải…' : 'Khởi tạo'}</button></div>{initializing === direction && <progress max="1" value={download} />}</section>)}
        <p className="note">Nếu Chrome cần giao diện đang mở để dịch, hãy giữ bảng công cụ này mở. Khi gặp lỗi, thử khởi tạo lại rồi quay về trang mua hàng.</p>
        <section><h2>Tự dịch theo website</h2>{(['taobao', '1688'] as const).map(name => <label className="setting-row" key={name}><span>{name === 'taobao' ? 'Taobao' : '1688'}</span><input type="checkbox" checked={settings.enabled[name]} onChange={e => void updateSettings({ enabled: { ...settings.enabled, [name]: e.target.checked } })} /></label>)}</section>
        {rateCard}
        <section><h2>Tỷ giá riêng</h2><p className="muted">Nhập số VNĐ cho 1 CNY nếu bạn dùng tỷ giá của bên mua hộ. Bỏ trống để dùng nguồn tự động.</p><label className="field">1 CNY =<div className="input-unit"><input inputMode="decimal" placeholder="Ví dụ 3870.34" value={manualRate} onChange={e => setManualRate(e.target.value)} /><span>VNĐ</span></div></label><div className="two-buttons"><button className="secondary" onClick={() => void updateSettings({ manualRate })}>Lưu tỷ giá</button><button className="text-button" onClick={() => { setManualRate(''); void updateSettings({ manualRate: '' }); }}>Dùng tự động</button></div></section>
        <section className="privacy"><h3>Dữ liệu ở lại trên máy</h3><p>Không tài khoản, quảng cáo hay theo dõi. Extension chỉ gọi Frankfurter để lấy tỷ giá; Chrome quản lý việc tải mô hình. Giá VNĐ là ước tính, chưa gồm các khoản phí chưa hiển thị.</p><p>Tỷ giá theo ngày. Bản dịch máy và chữ trong ảnh luôn cần đối chiếu khi thông tin chưa rõ.</p></section>
      </>}
      <footer><span>Miễn phí · Không tài khoản</span><button className="text-button" onClick={() => void chrome.runtime.openOptionsPage()}>Thiết lập ↗</button></footer>
    </main>
  </div>;
}
