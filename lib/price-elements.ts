import { adapters, isExcluded } from './sites';
import { parsePrices, type Price } from './prices';
import type { Site } from './types';

export function findPriceElements(root: HTMLElement, site: Site, readText: (element: Element) => string): Array<{ element: Element; prices: Price[] }> {
  const candidates = new Set<Element>();
  const selector = adapters[site].priceSelectors.join(',');
  for (const element of root.querySelectorAll(selector)) if (!isExcluded(element)) candidates.add(element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || isExcluded(parent) || (!/[¥￥元]|RMB|CNY/i.test(node.textContent || '') && !/[¥￥元]|RMB|CNY/i.test(readText(parent)))) continue;
    let element: Element | null = parent;
    for (let level = 0; element && element !== root && level < 4; level++, element = element.parentElement) {
      if (parsePrices(readText(element)).length) { candidates.add(element); break; }
    }
  }
  // Merge split integer / decimal / currency spans into a single price root.
  for (const candidate of [...candidates]) {
    let parent = candidate.parentElement;
    for (let level = 0; parent && parent !== root && level < 3; level++, parent = parent.parentElement) {
      if (!parent.matches(selector)) continue;
      const text = readText(parent).trim();
      if (parsePrices(text, true).length === 1 && text.length <= 80) { candidates.add(parent); }
    }
  }
  const entries = [...candidates].flatMap(element => {
    const text = readText(element).trim();
    const prices = parsePrices(text, element.matches(selector));
    return prices.length ? [{ element, prices }] : [];
  });
  return entries.filter(entry => !entries.some(other => other !== entry && other.element.contains(entry.element) && other.prices.length === 1));
}
