/** Preserve every source character while keeping long article nodes within model limits. */
export function splitText(text: string, limit = 1800): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const prefix = remaining.slice(0, limit);
    let cut = -1;
    for (const match of prefix.matchAll(/[。！？；\n]|\s+/g)) if (match.index! >= limit / 2) cut = match.index! + match[0].length;
    if (cut < 0) cut = limit;
    // Do not split a UTF-16 surrogate pair (emoji / uncommon Han characters).
    if (/[\uD800-\uDBFF]/.test(remaining[cut - 1])) cut--;
    chunks.push(remaining.slice(0, cut)); remaining = remaining.slice(cut);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
