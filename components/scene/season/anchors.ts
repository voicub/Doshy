import { WALL_T, planBounds, type Bounds } from "@/lib/geometry";
import type { Plan, Room } from "@/lib/types";

/** A door or window seen from outside: centre on the wall (plan metres), the outward unit normal and its size. */
export type Mount = { x: number; y: number; nx: number; ny: number; w: number; sill: number; h: number };
/** One balcony railing module: centre, unit direction along it and length (plan metres). */
type Rail = { x: number; y: number; dx: number; dy: number; len: number };

export type Anchors = {
  /** the building, balcony slab included */
  bounds: Bounds;
  balcony: Room | null;
  rails: Rail[];
  entrance: Mount | null;
  windows: Mount[];
};

export const RAIL_TOP = 1.1;
const BALCONY_NAME = /balcon|terrace|terasa|patio|loggia/i;
const PROBE = WALL_T / 2 + 0.15;
const inRoom = (rooms: Room[], x: number, y: number) => rooms.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);

/** Where the holiday decorations hang: the balcony, its railings, the entrance door and the outside faces of the windows. */
export function findAnchors(plan: Plan): Anchors {
  const rect = planBounds(plan) ?? { x0: 4, y0: 4, x1: 16, y1: 12 };
  const bounds = plan.rooms.reduce((b, r) => ({ x0: Math.min(b.x0, r.x), y0: Math.min(b.y0, r.y), x1: Math.max(b.x1, r.x + r.w), y1: Math.max(b.y1, r.y + r.h) }), rect);

  const rails = plan.items
    .filter((i) => i.kind === "balcony_railing")
    .map((i): Rail => ({ x: i.x, y: i.y, dx: Math.cos((i.rot * Math.PI) / 180), dy: Math.sin((i.rot * Math.PI) / 180), len: i.w }));
  const balcony = plan.rooms.find((r) => BALCONY_NAME.test(r.name)) ?? null;

  const entrance: Mount[] = [];
  const windows: Mount[] = [];
  for (const o of plan.openings) {
    const w = plan.walls.find((x) => x.id === o.wallId);
    const len = w ? Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) : 0;
    if (!w || len === 0) continue;
    const x = w.a.x + (w.b.x - w.a.x) * o.t, y = w.a.y + (w.b.y - w.a.y) * o.t;
    const n = { x: (w.b.y - w.a.y) / len, y: -(w.b.x - w.a.x) / len };
    const plus = inRoom(plan.rooms, x + n.x * PROBE, y + n.y * PROBE);
    if (plus === inRoom(plan.rooms, x - n.x * PROBE, y - n.y * PROBE)) continue; // interior, or both sides outside
    const m: Mount = { x, y, nx: plus ? -n.x : n.x, ny: plus ? -n.y : n.y, w: o.width, sill: o.sill, h: o.height };
    (o.type === "door" ? entrance : windows).push(m);
  }
  return { bounds, balcony, rails, entrance: entrance[0] ?? null, windows };
}

/** Lawn west of the building that the garden foliage keeps clear for the holiday centrepieces (tree, snowman, pumpkins, bunny). */
export function decorZone(b: Bounds) {
  return { x0: b.x0 - 5.2, x1: b.x0 - 0.3, y0: b.y1 - 4.2, y1: b.y1 + 2.2 };
}

/** Centrepiece spots on that lawn, plan metres. */
export function decorSpots(b: Bounds) {
  const z = decorZone(b);
  return {
    tree: { x: z.x0 + 1.9, y: z.y0 + 2.5 },
    snowman: { x: z.x1 - 1.0, y: z.y0 + 0.9 },
    pumpkins: [{ x: z.x1 - 0.9, y: z.y1 - 1.0 }, { x: z.x0 + 1.0, y: z.y0 + 1.0 }],
    bunny: { x: z.x1 - 1.1, y: z.y0 + 1.6 },
  };
}
