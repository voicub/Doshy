// A small, safe subset of Markdown (what Home Assistant notifications use): bold, italic, code, links, lists, line breaks.
// Parses to a plain tree that React renders as elements. There is no HTML output at all, so raw tags in the text stay text.
export type Inline = string | { t: "br" } | { t: "b" | "i" | "code"; c: Inline[] } | { t: "a"; href: string; c: Inline[] };
export type Block = { t: "p"; c: Inline[] } | { t: "ul" | "ol"; items: Inline[][] };

/** The URL when it is a plain http(s) link, else null (blocks javascript:, data:, relative paths...). */
export function httpUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

// code, **bold**, __bold__, *italic*, _italic_ (not inside a word), [text](url)
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|(?<![A-Za-z0-9_])__(.+?)__(?![A-Za-z0-9_])|\*([^*\s][^*]*?)\*|(?<![A-Za-z0-9_])_([^_\s][^_]*?)_(?![A-Za-z0-9_])|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of src.matchAll(INLINE)) {
    if (m.index > at) out.push(src.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[1] !== undefined) out.push({ t: "code", c: [m[1]] });
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ t: "b", c: parseInline(m[2] ?? m[3]) });
    else if (m[4] !== undefined || m[5] !== undefined) out.push({ t: "i", c: parseInline(m[4] ?? m[5]) });
    else {
      const href = httpUrl(m[7]);
      if (href) out.push({ t: "a", href, c: parseInline(m[6]) });
      else out.push(m[6]); // unsafe or relative link: keep only its text
    }
  }
  if (at < src.length) out.push(src.slice(at));
  return out;
}

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;

/** Blocks: paragraphs (single newlines become line breaks), bullet / numbered lists, headings shown as bold lines. */
export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { t: "ul" | "ol"; items: Inline[][] } | null = null;
  const flushPara = () => {
    if (!para.length) return;
    const c: Inline[] = [];
    para.forEach((line, i) => {
      if (i) c.push({ t: "br" });
      c.push(...parseInline(line));
    });
    blocks.push({ t: "p", c });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const line of src.replace(/\r\n?/g, "\n").slice(0, 4000).split("\n")) {
    const h = line.match(HEADING);
    const li = h ? null : line.match(BULLET);
    if (!line.trim()) { flushPara(); flushList(); }
    else if (h) { flushPara(); flushList(); blocks.push({ t: "p", c: [{ t: "b", c: parseInline(h[1]) }] }); }
    else if (li) {
      flushPara();
      const t = ORDERED.test(line) ? "ol" : "ul";
      if (list && list.t !== t) flushList();
      list ??= { t, items: [] };
      list.items.push(parseInline(li[1]));
    } else { flushList(); para.push(line); }
  }
  flushPara();
  flushList();
  return blocks;
}
