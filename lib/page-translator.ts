import { hasChinese } from './glossary';
import { isExcluded } from './sites';
import type { PageStatus } from './types';
import { splitText } from './text-chunks';

interface RecordState { original: string; rendered?: string; version: number; pending: boolean; failed?: string; }
interface AttrRecordState { attr: string; original: string; rendered?: string; pending: boolean; failed?: string; }
function isPriceNode(node: Text, parent: HTMLElement | null): boolean {
  if (!parent) return false;
  if (parent.closest('[data-tc-owned], [data-tc-price], [class*="price" i], [class*="Price"], [class*="cost" i], [data-price], [itemprop="price"]')) return true;
  return /[¥￥元]|RMB|CNY/i.test(node.data) || /^\s*\d+(?:\.\d+)?\s*(?:起|起批|件起批)/.test(node.data);
}

export class PageTranslator {
  private records = new Map<Text, RecordState>();
  private attrRecords = new Map<Element, Map<string, AttrRecordState>>();
  private shadowRoots = new Set<ShadowRoot>();
  private rescanRequested = false;
  private observer?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private enabled = false;
  private running = false;
  private error?: string;
  private translated = 0;
  constructor(
    private root: HTMLElement,
    private translate: (text: string) => Promise<string>,
    private onChange: () => void = () => {},
    private visible: (element: Element) => boolean = element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom >= -300 && rect.top <= innerHeight + 1000;
    },
    private translateBatch?: (texts: string[]) => Promise<string[]>,
  ) {}
  start() {
    if (this.enabled) return;
    this.enabled = true; this.generation++; this.error = undefined;
    this.observer = new MutationObserver(mutations => {
      let changed = false;
      for (const mutation of mutations) {
        const element = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) this.discoverShadowRoots(node);
        }
        if (element?.closest('[data-tc-owned]')) continue;
        if (mutation.type === 'childList' && [...mutation.addedNodes, ...mutation.removedNodes].length && [...mutation.addedNodes, ...mutation.removedNodes].every(node => node instanceof Element && node.hasAttribute('data-tc-owned'))) continue;
        if (mutation.type === 'characterData') {
          const node = mutation.target as Text, record = this.records.get(node);
          if (record && node.data === record.rendered) continue;
          if (record) { record.original = node.data; record.rendered = undefined; record.version++; record.failed = undefined; }
        }
        if (mutation.type === 'attributes' && element && mutation.attributeName) {
          const record = this.attrRecords.get(element)?.get(mutation.attributeName);
          const current = element.getAttribute(mutation.attributeName) || '';
          if (record?.rendered === current) continue;
          if (record) { record.original = current; record.rendered = undefined; record.failed = undefined; }
        }
        changed = true;
      }
      if (changed) { this.schedule(); this.onChange(); }
    });
    this.observeRoot(this.root);
    this.discoverShadowRoots(this.root);
    this.schedule();
  }
  private observeRoot(root: Node) {
    this.observer?.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'title', 'placeholder', 'aria-label', 'alt', 'value'],
    });
  }
  private discoverShadowRoots(node: Node) {
    const candidates: Element[] = [];
    if (node instanceof Element) candidates.push(node);
    if (node instanceof DocumentFragment || node instanceof Element) candidates.push(...node.querySelectorAll('*'));
    for (const candidate of candidates) {
      const shadow = candidate.shadowRoot;
      if (!shadow || this.shadowRoots.has(shadow)) continue;
      this.shadowRoots.add(shadow);
      this.observeRoot(shadow);
      this.discoverShadowRoots(shadow);
    }
  }
  private scanRoots(): Array<HTMLElement | ShadowRoot> {
    return [this.root, ...[...this.shadowRoots].filter(root => root.isConnected)];
  }
  stop() {
    this.enabled = false; this.generation++; this.observer?.disconnect(); clearTimeout(this.timer);
    for (const [node, record] of this.records) {
      if (node.isConnected && record.rendered !== undefined && node.data === record.rendered) node.data = record.original;
    }
    for (const [el, records] of this.attrRecords) for (const record of records.values()) {
      if (el.isConnected && record.rendered !== undefined && el.getAttribute(record.attr) === record.rendered) {
        el.setAttribute(record.attr, record.original);
        if (record.attr === 'value' && el instanceof HTMLInputElement) el.value = record.original;
        if (record.attr === 'placeholder' && el instanceof HTMLInputElement) el.placeholder = record.original;
      }
    }
    this.records.clear(); this.attrRecords.clear(); this.shadowRoots.clear(); this.translated = 0; this.error = undefined;
    this.onChange();
  }
  retry() {
    this.error = undefined;
    for (const record of this.records.values()) record.failed = undefined;
    for (const records of this.attrRecords.values()) for (const record of records.values()) record.failed = undefined;
    this.schedule();
  }
  original(node: Text) {
    const record = this.records.get(node);
    return record && node.data === record.rendered ? record.original : node.data;
  }
  originalText(element: Element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = '', node: Node | null;
    while ((node = walker.nextNode())) if (node.parentElement && !isExcluded(node.parentElement)) text += this.original(node as Text);
    return text;
  }
  originalsUnder(element: Element): string | undefined {
    if (!element.isConnected || element === this.root || element.childElementCount > 6) return;
    const parts: string[] = [];
    for (const [node, record] of this.records) {
      if (node.isConnected && record.rendered && element.contains(node)) {
        parts.push(record.original);
        if (parts.length > 8) return;
      }
    }
    const text = parts.join(' ').trim();
    return text && text.length <= 500 ? text : undefined;
  }
  status(): PageStatus {
    const pendingText = [...this.records.values()].filter(r => r.pending).length;
    const pendingAttr = [...this.attrRecords.values()].flatMap(records => [...records.values()]).filter(r => r.pending).length;
    return { enabled: this.enabled, translated: this.translated, pending: pendingText + pendingAttr, error: this.error };
  }
  schedule = () => {
    if (!this.enabled) return;
    this.rescanRequested = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.scan(), 50);
  };

  async translateNodes(nodes: Text[]) {
    if (!this.enabled || !nodes.length) return;
    const generation = this.generation;
    const valid: { node: Text; original: string; version: number }[] = [];
    for (const node of nodes) {
      if (!node.isConnected || !node.parentElement || isExcluded(node.parentElement) || isPriceNode(node, node.parentElement)) continue;
      let record = this.records.get(node);
      if (!record) { record = { original: node.data, version: 0, pending: false }; this.records.set(node, record); }
      if (node.data !== record.rendered && node.data !== record.original) { record.original = node.data; record.version++; }
      const original = record.original, version = record.version;
      if (hasChinese(original) && !record.pending) {
        record.pending = true;
        valid.push({ node, original, version });
      }
    }
    if (!valid.length) return;
    try {
      const groups = valid.map(v => v.original.length > 6000 ? splitText(v.original) : [v.original]);
      const texts = groups.flat();
      const results: string[] = [];
      for (let offset = 0; offset < texts.length; offset += 60) {
        if (!this.enabled || this.generation !== generation) return;
        const slice = texts.slice(offset, offset + 60);
        let batchResults: string[];
        try {
          batchResults = this.translateBatch
            ? await this.translateBatch(slice)
            : await Promise.all(slice.map(text => this.translate(text)));
        } catch (batchErr) {
          const settled = await Promise.allSettled(slice.map(text => this.translate(text)));
          if (settled.every(s => s.status === 'rejected')) {
            throw batchErr;
          }
          batchResults = settled.map((s, idx) => s.status === 'fulfilled' ? s.value : slice[idx]);
        }
        results.push(...batchResults);
      }
      let cursor = 0;
      const translated = groups.map(group => { const value = results.slice(cursor, cursor + group.length).join(' '); cursor += group.length; return value; });
      for (let i = 0; i < valid.length; i++) {
        const { node, original, version } = valid[i];
        const res = translated[i];
        const record = this.records.get(node);
        if (record) record.pending = false;
        if (record && res === original) { record.failed = original; continue; }
        if (this.enabled && this.generation === generation && node.isConnected && node.data === original && record && record.version === version && res) {
          record.rendered = res;
          node.data = res;
          this.translated++;
        }
      }
    } catch (error) {
      for (const { node, original } of valid) {
        const record = this.records.get(node);
        if (record) { record.pending = false; record.failed = original; }
      }
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      for (const { node } of valid) { const record = this.records.get(node); if (record) record.pending = false; }
      this.onChange();
    }
  }

  async scan() {
    if (!this.enabled || this.running) return;
    this.running = true; this.rescanRequested = false;
    const generation = this.generation;
    try {
      for (const node of this.records.keys()) if (!node.isConnected) this.records.delete(node);
      for (const el of this.attrRecords.keys()) if (!el.isConnected) this.attrRecords.delete(el);
      const filter: NodeFilter = {
        acceptNode: node => {
          const parent = node.parentElement;
          if (!parent || isExcluded(parent) || !this.visible(parent) || isPriceNode(node as Text, parent)) return NodeFilter.FILTER_REJECT;
          const record = this.records.get(node as Text);
          if (record?.rendered === (node as Text).data || record?.failed === (node as Text).data || record?.pending) return NodeFilter.FILTER_REJECT;
          return hasChinese((node as Text).data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      };

      const batch: Text[] = [];

      // Prioritize active popups, modals, dialogs, and captchas so they translate immediately
      for (const root of this.scanRoots()) {
        const modals = root.querySelectorAll<HTMLElement>(
          '[role="dialog"], [class*="dialog" i], [class*="modal" i], [class*="popup" i], [class*="captcha" i], .baxia-dialog, [id*="baxia" i], .nc-container, [id*="nc_" i], .ui-dialog'
        );
        for (const modal of modals) {
          if (!this.visible(modal) || modal.closest('[data-tc-owned]')) continue;
          const modalWalker = document.createTreeWalker(modal, NodeFilter.SHOW_TEXT, filter);
          while (batch.length < 60) {
            const node = modalWalker.nextNode();
            if (!node) break;
            if (!batch.includes(node as Text)) batch.push(node as Text);
          }
          if (batch.length >= 60) break;
        }
        if (batch.length >= 60) break;
      }

      if (batch.length < 60) {
        for (const root of this.scanRoots()) {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, filter);
          while (batch.length < 60) {
            const node = walker.nextNode();
            if (!node) break;
            if (!batch.includes(node as Text)) batch.push(node as Text);
          }
          if (batch.length >= 60) break;
        }
      }

      if (batch.length) {
        await this.translateNodes(batch);
      }

      // Translate visible metadata (including input buttons) without touching user inputs.
      const pendingAttrs: { el: HTMLElement; attr: string; val: string; record: AttrRecordState }[] = [];
      const attrSelector = '[placeholder], [title], [aria-label], img[alt], input[type="image"][alt], input[type="button"][value], input[type="submit"][value], input[type="reset"][value]';
      for (const root of this.scanRoots()) for (const el of root.querySelectorAll<HTMLElement>(attrSelector)) {
        if (!this.enabled || this.generation !== generation || pendingAttrs.length >= 60) break;
        if (!el.isConnected || !this.visible(el) || el.closest('[data-tc-owned],[translate="no"],[contenteditable]:not([contenteditable="false"])') || (el.parentElement && isExcluded(el.parentElement))) continue;
        const isInputButton = el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes((el.type || '').toLowerCase());
        const attrsToScan = isInputButton
          ? ['value', 'title', 'aria-label']
          : ['placeholder', 'title', 'aria-label', 'alt'];

        for (const attr of attrsToScan) {
          const val = el.getAttribute(attr) || '';
          if (!val || !hasChinese(val) || val.length > 1000) continue;
          let records = this.attrRecords.get(el);
          if (!records) { records = new Map(); this.attrRecords.set(el, records); }
          let record = records.get(attr);
          if (!record) { record = { attr, original: val, pending: false }; records.set(attr, record); }
          if (record.rendered === val || record.pending || record.failed === val) continue;
          if (record.original !== val) { record.original = val; record.rendered = undefined; }
          record.pending = true;
          pendingAttrs.push({ el, attr, val, record });
          if (pendingAttrs.length >= 60) break;
        }
      }
      if (pendingAttrs.length) {
        try {
          const texts = pendingAttrs.map(p => p.val);
          const translated = this.translateBatch ? await this.translateBatch(texts) : await Promise.all(texts.map(t => this.translate(t)));
          for (let i = 0; i < pendingAttrs.length; i++) {
            const { el, attr, val, record } = pendingAttrs[i];
            const result = translated[i];
            if (this.enabled && this.generation === generation && el.isConnected && el.getAttribute(attr) === val && record.original === val && result) {
              record.rendered = result;
              el.setAttribute(attr, result);
              if (attr === 'value' && el instanceof HTMLInputElement) el.value = result;
              if (attr === 'placeholder' && el instanceof HTMLInputElement) el.placeholder = result;
              this.translated++;
            }
          }
        } catch (error) {
          this.error = error instanceof Error ? error.message : String(error);
          for (const { record, val } of pendingAttrs) record.failed = val;
        } finally { for (const { record } of pendingAttrs) record.pending = false; }
      }

      // If batch had items, schedule next batch to finish the rest of the page unless fatal error
      const isFatal = Boolean(this.error && (
        this.error.includes('chưa khả dụng') ||
        this.error.includes('chưa cung cấp') ||
        this.error.includes('Thiết lập') ||
        this.error.includes('OFFSCREEN')
      ));
      // Continue if either text or visible attributes filled this batch. This is
      // important for dialogs containing many input buttons but little body text.
      if ((batch.length > 0 || pendingAttrs.length > 0) && !isFatal) this.schedule();
    } finally {
      this.running = false;
      if (this.rescanRequested) this.schedule();
      this.onChange();
    }
  }
}
