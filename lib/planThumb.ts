import { isRecord } from "./guards.ts";
import { firstLevelId, levelIdOf } from "./levels.ts";
import type { Plan, Pt } from "./types.ts";

/**
 * A small top-down picture of a plan, as an SVG string: floors, walls, garden ground, paths and the pieces as little rectangles. No WebGL, no DOM, no
 * fonts: a pure function of the plan, so the same plan always gives the same string (the uploader compares strings to know whether the picture changed)
 * and a plan that is not on screen (the plan manager) can be drawn from its JSON alone. Only the first storey (the one a piece without a level is on) is drawn.
 */

export const THUMB_W = 320;
export const THUMB_H = 200;
const PAD = 14; // px of margin around the drawing
const MIN_PX = 1.6; // a piece never gets smaller than this, so a tiny plan still shows its pieces
// ponytail: at most this many pieces are drawn (a 5 MB plan can hold tens of thousands); the picture is a hint, upgrade to sampling if a big plan looks bare
const MAX_PIECES = 1500;

const BG = "#0b1217";
const COLORS = { room: "#5ad7ff", grass: "#4caf6a", water: "#3b86c4", wall: "#dbe6ec", item: "#9fe6ff", ground: "#6f8a74", path: "#7c8b94", dash: "#4a6e82" } as const;
const FRAME = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${THUMB_W} ${THUMB_H}" width="${THUMB_W}" height="${THUMB_H}"><rect width="${THUMB_W}" height="${THUMB_H}" fill="${BG}"/>`;

type Shape = { pts: Pt[]; fill?: string; opacity?: number; stroke?: string; width?: number };

const finite = (...n: number[]) => n.every(Number.isFinite);

/** The four corners of a w x h rectangle centred on (cx, cy), turned `rot` degrees clockwise (y points down). */
function turned(cx: number, cy: number, w: number, h: number, rot: number): Pt[] {
  const a = (rot * Math.PI) / 180;
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => ({ x: cx + (x * cos - y * sin) / 2, y: cy + (x * sin + y * cos) / 2 }));
}

/** A room or ground patch is stored by its top-left corner and turned about its centre. */
const patch = (r: { x: number; y: number; w: number; h: number; rot?: number }) => turned(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, r.rot ?? 0);

function shapesOf(plan: Plan): { under: Shape[]; walls: Shape[]; pieces: Shape[] } {
  const ground = firstLevelId(plan);
  const here = (e: { level?: string }) => levelIdOf(plan, e) === ground;
  const fillOf = (kind: string) => (kind === "grass" ? COLORS.grass : kind === "water" ? COLORS.water : COLORS.room);

  const under: Shape[] = [];
  for (const g of plan.ground ?? []) if (finite(g.x, g.y, g.w, g.h)) under.push({ pts: patch(g), fill: g.kind === "grass" || g.kind === "water" ? fillOf(g.kind) : COLORS.ground, opacity: 0.45 });
  for (const p of plan.paths ?? []) if (p.points.length > 1 && p.points.every((q) => finite(q.x, q.y))) under.push({ pts: p.points, stroke: COLORS.path, width: Math.max(p.width, 0.3) });
  for (const r of plan.rooms) if (here(r) && finite(r.x, r.y, r.w, r.h)) under.push({ pts: patch(r), fill: fillOf(r.floor), opacity: 0.28 });

  const walls: Shape[] = [];
  for (const w of plan.walls) if (here(w) && finite(w.a.x, w.a.y, w.b.x, w.b.y)) walls.push({ pts: [w.a, w.b], stroke: COLORS.wall, width: w.thickness ?? 0.2 });

  const pieces: Shape[] = [];
  for (const i of plan.items) {
    if (pieces.length >= MAX_PIECES) break;
    if (here(i) && finite(i.x, i.y, i.w, i.d)) pieces.push({ pts: turned(i.x, i.y, i.w, i.d, i.rot), fill: COLORS.item, opacity: 0.85 });
  }
  return { under, walls, pieces };
}

/** The picture's frame in plan metres, or null when nothing was drawn. */
function boundsOf(shapes: Shape[]): { x0: number; y0: number; w: number; h: number } | null {
  const pts = shapes.flatMap((s) => s.pts);
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return { x0, y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

const n = (v: number) => String(Math.round(v * 10) / 10);

function emptySvg(): string {
  const [cx, cy] = [THUMB_W / 2, THUMB_H / 2];
  return `${FRAME}<rect x="${cx - 60}" y="${cy - 38}" width="120" height="76" fill="none" stroke="${COLORS.dash}" stroke-width="1.5" stroke-dasharray="5 4"/></svg>`;
}

/** The plan as an SVG string, THUMB_W x THUMB_H, the drawing scaled to fit and centred. An empty plan gives a dashed outline. */
export function thumbSvg(plan: Plan): string {
  const { under, walls, pieces } = shapesOf(plan);
  const all = [...under, ...walls, ...pieces];
  const box = boundsOf(all);
  if (!box) return emptySvg();
  const scale = Math.min((THUMB_W - 2 * PAD) / Math.max(box.w, 0.5), (THUMB_H - 2 * PAD) / Math.max(box.h, 0.5));
  const [ox, oy] = [(THUMB_W - box.w * scale) / 2 - box.x0 * scale, (THUMB_H - box.h * scale) / 2 - box.y0 * scale];
  const at = (p: Pt) => `${n(p.x * scale + ox)},${n(p.y * scale + oy)}`;

  const draw = (s: Shape): string => {
    const pts = s.pts.map(at).join(" ");
    if (s.stroke) return `<polyline points="${pts}" fill="none" stroke="${s.stroke}" stroke-width="${n(Math.max((s.width ?? 0.2) * scale, MIN_PX))}" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<polygon points="${pts}" fill="${s.fill}" fill-opacity="${s.opacity ?? 1}"/>`;
  };
  return `${FRAME}${under.map(draw).join("")}${walls.map(draw).join("")}${pieces.map(draw).join("")}</svg>`;
}

/** `v` as a plan when it has the four lists every plan has (what the server checks before keeping one), else null: a plan fetched as JSON is not trusted to be one. */
export function asPlan(v: unknown): Plan | null {
  if (!isRecord(v)) return null;
  const lists = ["walls", "openings", "rooms", "items"] as const;
  return lists.every((k) => Array.isArray(v[k])) ? (v as unknown as Plan) : null; // the lists are there; the entries are the same data the editor already loaded
}

/** The most bytes the server keeps for one thumbnail (lib/db/dashboards MAX_THUMB_BYTES, which the browser bundle cannot import). */
export const THUMB_MAX_BYTES = 64 * 1024;

/** True for the placeholder an empty plan gets: nothing worth uploading, the plan list shows the plan's icon instead. */
export const isBlankThumb = (svg: string): boolean => !svg.includes("<poly");
