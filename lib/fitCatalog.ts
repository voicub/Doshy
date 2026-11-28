// Finding a piece to try in "Does it fit here?": a few catalogue entries whose label matches what was typed. Pure: the node test runner loads this file directly.
// The catalogue is passed in (the caller has lib/catalog.ts), so the search needs nothing but the fields it reads.

/** The fields of a catalogue entry the search reads (lib/catalog.ts `Def`). */
export type PieceDef = { label: string; w: number; d: number; h: number; wall?: true; legacy?: true; pillar?: true };
export type Piece = { kind: string; label: string; w: number; d: number };

/** Plain words that fill the search box in one tap. */
export const QUICK_SEARCHES = ["Sofa", "Bed", "Wardrobe", "Table", "Desk", "Fridge"] as const;

/** Pieces that stand on the floor and take up room: not wall-mounted, ceiling, rugs, pillars or retired models. */
const takesFloorSpace = (kind: string, d: PieceDef) => !d.wall && !d.legacy && !d.pillar && !/ceiling/.test(kind) && d.h > 0.05;

/** How well a label matches the words: 3 starts with them, 2 a word in it starts with them, 1 contains them, 0 no. Every typed word must match. */
function rank(label: string, words: readonly string[]): number {
  const l = label.toLowerCase();
  if (!words.every((w) => l.includes(w))) return 0;
  if (l.startsWith(words[0])) return 3;
  return words.every((w) => l.split(/[^a-z0-9]+/).some((t) => t.startsWith(w))) ? 2 : 1;
}

/** At most `limit` floor pieces whose label matches `query`, best match first (shorter labels first among equals). Nothing typed: none. */
export function searchPieces(catalog: Readonly<Record<string, PieceDef>>, query: string, limit = 6): Piece[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return Object.entries(catalog)
    .filter(([kind, d]) => takesFloorSpace(kind, d))
    .map(([kind, d]) => ({ kind, label: d.label, w: d.w, d: d.d, r: rank(d.label, words) }))
    .filter((p) => p.r > 0)
    .sort((a, b) => b.r - a.r || a.label.length - b.label.length || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ r: _r, ...p }) => p);
}
