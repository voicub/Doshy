/** Plain one-line text: no markup, no control characters, bounded. Used for every name or label that comes from a request. */
export function cleanText(raw: unknown, max: number, fallback: string): string {
  const s = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f<>`"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return s || fallback;
}
