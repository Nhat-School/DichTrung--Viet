export type Direction = 'zh-vi' | 'vi-zh';
export type CommerceSite = 'taobao' | '1688';
export type Site = CommerceSite | `http://${string}` | `https://${string}`;
export type OcrLanguage = 'chi_sim' | 'chi_tra';
export interface Settings { enabled: Record<string, boolean>; manualRate: string; onlineFallback: boolean; ocrLanguage: OcrLanguage; }
export interface Rate {
  rate: string;
  date: string;
  fetchedAt: number;
  source: 'Frankfurter' | 'manual';
  stale: boolean;
  error?: string;
}
export interface EngineStatus { direction: Direction; state: Availability | 'unsupported'; }
export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';
export interface NativeTranslator {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}
export interface NativeTranslatorAPI {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(options: {
    sourceLanguage: string; targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<NativeTranslator>;
}
declare global { interface Window { Translator?: NativeTranslatorAPI } }
export interface Crop {
  x: number; y: number; width: number; height: number;
  viewportWidth: number; viewportHeight: number;
}
export interface OcrLine { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; }
export interface OcrResult { image: string; text: string; confidence: number; lines?: OcrLine[]; }
export interface OcrState {
  state: 'working' | 'done' | 'error';
  progress?: number;
  result?: OcrResult;
  error?: string;
  jobId?: string;
  tabId?: number;
  status?: string;
  expires: number;
}
export interface PageStatus { enabled: boolean; translated: number; pending: number; error?: string; }
export type EngineRequest =
  | { action: 'translate'; text: string; direction: Direction }
  | { action: 'translate-batch'; texts: string[]; direction: Direction }
  | { action: 'status' }
  | { action: 'ocr'; image: string; crop: Crop; jobId: string; language?: OcrLanguage }
  | { action: 'cancel-ocr'; jobId: string };
export type Request =
  | { type: 'translate'; text: string; direction: Direction }
  | { type: 'translate-batch'; texts: string[]; direction: Direction }
  | { type: 'get-state' }
  | { type: 'set-settings'; settings: Partial<Settings> }
  | { type: 'get-rate'; force?: boolean }
  | { type: 'engine-status' }
  | { type: 'enable-site'; tabId: number }
  | { type: 'visible-engine'; ready: boolean }
  | { type: 'start-capture'; mode: 'region' | 'image'; tabId: number }
  | { type: 'capture'; crop: Crop }
  | { type: 'cancel-ocr' }
  | { type: 'get-ocr' }
  | { type: 'clear-ocr' }
  | { type: 'get-page-status'; tabId: number };
export type Reply<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code?: string };
export class AppError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export function siteFor(url: string): Site | undefined {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return;
    if (hostname === 'taobao.com' || hostname.endsWith('.taobao.com')) return 'taobao';
    if (hostname === '1688.com' || hostname.endsWith('.1688.com')) return '1688';
    return `${protocol}//${hostname}` as Site;
  } catch { /* Unsupported URL. */ }
}
export function isCommerceSite(site: string | undefined): site is CommerceSite { return site === 'taobao' || site === '1688'; }
export function sitePattern(site: string): string | undefined {
  if (isCommerceSite(site)) return `*://*.${site}.com/*`;
  return siteFor(site) === site ? `${site}/*` : undefined;
}
