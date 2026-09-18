import Decimal from 'decimal.js';
import { convert } from './currency';
export interface Price { amounts: string[]; raw: string; }
const NUMBER = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:万)?';
const RANGE = `${NUMBER}(?:\\s*[-~～—至]\\s*[¥￥]?\\s*${NUMBER})?`;
const explicit = new RegExp(`(?:[¥￥]|RMB\\s*|CNY\\s*)\\s*(${RANGE})|(${RANGE})\\s*元`, 'gi');
const bare = new RegExp(`^\\s*(${RANGE})(?:\\s*(?:起|起批|/\\s*(?:件|个|套|箱|米|千克|kg)))?\\s*$`, 'i');
export function parsePrices(text: string, allowBare = false): Price[] {
  const normalized = text.replace(/\u00a0/g, ' ').trim();
  if (normalized.length > 200 || /(?:JPY|日元|日圓|円)/i.test(normalized)) return [];
  const matches = Array.from(normalized.matchAll(explicit)).map(match => ({ raw: match[0], value: match[1] || match[2] }));
  if (!matches.length && allowBare) {
    const match = normalized.match(bare);
    if (match) matches.push({ raw: match[0], value: match[1] });
  }
  return matches.map(({ raw, value }) => ({
    raw,
    amounts: [...value.matchAll(new RegExp(NUMBER, 'g'))].map(match =>
      new Decimal(match[0].replace(/[,万]/g, '')).mul(match[0].endsWith('万') ? 10000 : 1).toString()),
  })).filter(price => price.amounts.length > 0 && price.amounts.every(value => new Decimal(value).lte(1e12)));
}
export function formatPrice(price: Price, rate: string, inPlace = false) {
  const converted = price.amounts.map(amount => convert(amount, rate)).join(' – ');
  return inPlace ? converted : '≈ ' + converted;
}
