// A Poly Haven 3D model as a "My pieces" piece: the words shown next to it, the credit that stays with it and the pack header that carries the credit when
// pieces are shared. Pure (the node test runner loads it): the browser side is components/PolyHavenModelImport.tsx and ModelImport.tsx.
import { cleanName, cleanText, MAX_PACK_TEXT, type CustomPiece, type PiecePack, type PieceSource } from "./customCatalog.ts";
import { HEAVY_TRIANGLES, PH_SITE, type PhItem } from "./polyhaven.ts";

export const PH_PACK_LICENCE = "CC0 (Poly Haven)";
export const PH_PACK_AUTHOR = "Poly Haven asset authors";

/** The name a model piece starts with: Poly Haven's own name, short enough for the name field. */
export const phPieceName = (item: Pick<PhItem, "id" | "name">): string => cleanName(item.name, cleanName(item.id.replace(/[-_]+/g, " ")));

/** "85 x 77 x 107 cm" (width x depth x height) from a model's box in metres; null when the listing has no box. */
export function sizeText(dims: readonly number[] | undefined): string | null {
  if (!dims || dims.length < 3) return null;
  const cm = dims.slice(0, 3).map((m) => Math.max(1, Math.round(m * 100)));
  return `${cm.join(" x ")} cm`;
}

export const isHeavy = (item: Pick<PhItem, "polycount">): boolean => (item.polycount ?? 0) > HEAVY_TRIANGLES;

/** The line the browse dialog shows under a chosen model: its real size and polygon count, with a warning when it is heavy. */
export function modelDetail(item: Pick<PhItem, "dims" | "polycount">): { text: string; warn?: boolean } | null {
  const parts = [sizeText(item.dims), item.polycount ? `${item.polycount.toLocaleString("en-US")} polygons` : null].filter((s): s is string => !!s);
  const heavy = isHeavy(item) ? `This model is heavy (${item.polycount?.toLocaleString("en-US")} polygons). It may make the dashboard slow on a tablet or a Raspberry Pi.` : null;
  const text = [parts.join(", "), heavy].filter(Boolean).join(" ");
  return text ? { text, ...(heavy ? { warn: true } : {}) } : null;
}

/** Which asset a piece came from, kept on the piece. */
export const sourceOf = (item: Pick<PhItem, "id" | "name" | "authors">): PieceSource => {
  const authors = cleanText(item.authors.join(", "), MAX_PACK_TEXT);
  return { type: "polyhaven", id: item.id, name: cleanText(item.name, MAX_PACK_TEXT, item.id), ...(authors ? { authors } : {}) };
};

/** The pack tag that makes the credit show in Share > My pieces ("by <author>", "Licence note: CC0"). `id` is made like a model id. */
export const packOf = (item: Pick<PhItem, "id" | "name" | "authors">, id: string, at: number): PiecePack => {
  const { name, authors } = sourceOf(item);
  return { id, name: cleanText(`Poly Haven: ${name}`, MAX_PACK_TEXT), ...(authors ? { author: authors } : {}), licence: PH_PACK_LICENCE, at };
};

/** Search words for the piece: the asset's categories and tags (what a person would type to find a lamp or a chair). */
export const tagsOf = (item: Pick<PhItem, "cats" | "tags">): string => cleanText([...new Set([...item.cats, ...item.tags])].join(" "), MAX_PACK_TEXT);

export const sourceLink = (id: string): string => `${PH_SITE}/a/${id}`;

/** The Poly Haven pieces of a list, one entry per asset (the same model imported twice is credited once). */
export function creditsOf(pieces: readonly Pick<CustomPiece, "source">[]): PieceSource[] {
  const seen = new Map<string, PieceSource>();
  for (const p of pieces) if (p.source && !seen.has(p.source.id)) seen.set(p.source.id, p.source);
  return [...seen.values()];
}

/**
 * The author and licence note for an export: what the person typed, or when they left a box empty and the pack holds Poly Haven models, the
 * Poly Haven credit. Never overwrites typed text.
 */
export function packCredit(pieces: readonly Pick<CustomPiece, "source">[], typed: { author: string; licence: string }): { author: string; licence: string } {
  if (!creditsOf(pieces).length) return typed;
  return { author: typed.author.trim() ? typed.author : PH_PACK_AUTHOR, licence: typed.licence.trim() ? typed.licence : PH_PACK_LICENCE };
}
