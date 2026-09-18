import type { CommerceSite } from './types';
export interface SiteAdapter { priceSelectors: string[]; }
export const adapters: Record<CommerceSite, SiteAdapter> = {
  taobao: { priceSelectors: ['[class*="price" i]', '[class*="Price"]', '[data-price]', '[itemprop="price"]'] },
  '1688': { priceSelectors: ['[class*="price" i]', '[class*="Price"]', '[class*="cost" i]', '[data-price]', '[itemprop="price"]'] },
};
export const ignoredSelector = 'script,style,noscript,textarea,input,select,option,pre,code,svg,canvas,video,[contenteditable]:not([contenteditable="false"]),[translate="no"],[data-tc-owned],[data-tc-price]';
export function isExcluded(element: Element): boolean {
  return !!element.closest(ignoredSelector) || !!element.closest('[hidden]');
}
