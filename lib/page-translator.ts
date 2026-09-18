import { hasChinese } from './glossary';
import { isExcluded } from './sites';
import type { PageStatus } from './types';

interface RecordState { original: string; rendered?: string; version: number; pending: boolean; failed?: string; }
interface AttrRecordState { attr: string; original: string; rendered?: string; pending: boolean; failed?: string; }
export class PageTranslator {
  private records = new Map<Text, RecordState>();
  private attrRecords = new Map<Element, AttrRecordState>();
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
      return rect.width > 0 && rect.height > 0 && rect.bottom >= -200 && rect.top <= innerHeight + 600;
    },
  ) {}
  start() {
    if (this.enabled) return;
    this.enabled = true; this.generation++; this.error = undefined;
    this.observer = new MutationObserver(mutations => {
      let changed = false;
      for (const mutation of mutations) {
        const element = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (element?.closest('[data-tc-owned]')) continue;
        if (mutation.type === 'childList' && [...mutation.addedNodes, ...mutation.removedNodes].length && [...mutation.addedNodes, ...mutation.removedNodes].every(node => node instanceof Element && node.hasAttribute('data-tc-owned'))) continue;
        if (mutation.type === 'characterData') {
          const node = mutation.target as Text, record = this.records.get(node);
          if (record && node.data === record.rendered) continue;
          if (record) { record.original = node.data; record.rendered = undefined; record.version++; record.failed = undefined; }
        }
        if (mutation.type === 'attributes' && element && isExcluded(element)) continue;
        changed = true;
      }
      if (changed) { this.schedule(); this.onChange(); }
    });
    this.observer.observe(this.root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    });
    this.schedule();
  }
  stop() {
    this.enabled = false; this.generation++; this.observer?.disconnect(); clearTimeout(this.timer);
    for (const [node, record] of this.records) {
      if (node.isConnected && record.rendered !== undefined && node.data === record.rendered) node.data = record.original;
    }
    for (const [el, record] of this.attrRecords) {
      if (el.isConnected && record.rendered !== undefined && el.getAttribute(record.attr) === record.rendered) {
        el.setAttribute(record.attr, record.original);
      }
    }
    this.records.clear(); this.attrRecords.clear(); this.translated = 0; this.error = undefined;
    this.onChange();
  }
  retry() {
    this.error = undefined;
    for (const record of this.records.values()) record.failed = undefined;
    for (const record of this.attrRecords.values()) record.failed = undefined;
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
    const pendingAttr = [...this.attrRecords.values()].filter(r => r.pending).length;
    return { enabled: this.enabled, translated: this.translated, pending: pendingText + pendingAttr, error: this.error };
  }
  schedule = () => {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.scan(), 180);
  };
  async scan() {
    if (!this.enabled || this.running) return;
    this.running = true;
    const generation = this.generation;
    try {
      for (const node of this.records.keys()) if (!node.isConnected) this.records.delete(node);
      for (const el of this.attrRecords.keys()) if (!el.isConnected) this.attrRecords.delete(el);
      const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
          const parent = node.parentElement;
          if (!parent || isExcluded(parent) || !this.visible(parent)) return NodeFilter.FILTER_REJECT;
          const record = this.records.get(node as Text);
          if (record?.rendered === (node as Text).data || record?.failed === (node as Text).data || record?.pending) return NodeFilter.FILTER_REJECT;
          return hasChinese((node as Text).data) && (node as Text).data.trim().length <= 6000 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      const batch: Text[] = [];
      while (batch.length < 40) { const node = walker.nextNode(); if (!node) break; batch.push(node as Text); }
      for (const node of batch) {
        if (!this.enabled || this.generation !== generation) break;
        if (!node.isConnected || !node.parentElement || isExcluded(node.parentElement)) continue;
        let record = this.records.get(node);
        if (!record) { record = { original: node.data, version: 0, pending: false }; this.records.set(node, record); }
        if (node.data !== record.rendered && node.data !== record.original) { record.original = node.data; record.version++; }
        const original = record.original, version = record.version;
        record.pending = true;
        try {
          const result = await this.translate(original);
          if (this.enabled && this.generation === generation && node.isConnected && node.data === original && record.version === version) {
            record.rendered = result; node.data = result; this.translated++;
          }
        } catch (error) {
          record.failed = original;
          this.error = error instanceof Error ? error.message : String(error);
          // Setup failures affect every string. Avoid hammering the model until retry.
          if ((error as { code?: string })?.code && ['NEED_SETUP', 'UNSUPPORTED', 'NEED_VISIBLE'].includes((error as { code: string }).code)) {
            break;
          }
        } finally { record.pending = false; }
      }

      // Translate Chinese placeholders on inputs/textareas and title attributes
      const attrElements = this.root.querySelectorAll<HTMLElement>('input[placeholder], textarea[placeholder], [title]');
      for (const el of attrElements) {
        if (!this.enabled || this.generation !== generation) break;
        if (!el.isConnected || el.closest('[data-tc-owned]')) continue;
        const attr = el.hasAttribute('placeholder') ? 'placeholder' : 'title';
        const val = el.getAttribute(attr) || '';
        if (!val || !hasChinese(val) || val.length > 300) continue;
        let record = this.attrRecords.get(el);
        if (!record) {
          record = { attr, original: val, pending: false };
          this.attrRecords.set(el, record);
        }
        if (record.rendered || record.pending || record.failed === val) continue;
        record.pending = true;
        try {
          const result = await this.translate(record.original);
          if (this.enabled && this.generation === generation && el.isConnected) {
            record.rendered = result;
            el.setAttribute(attr, result);
            this.translated++;
          }
        } catch {
          record.failed = val;
        } finally {
          record.pending = false;
        }
      }

      if (batch.length === 40 && !this.error) this.schedule();
    } finally {
      this.running = false;
      this.onChange();
    }
  }
}
