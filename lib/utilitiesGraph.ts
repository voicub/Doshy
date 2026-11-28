// Turns the drawn pipes into a graph and traces a leak or gas alarm back to the valves that stop it. The pipes are polylines, so the graph has to find where they meet:
// the end of one pipe on another (a branch), two pipes of the same kind that cross, and the ends of pipes at the same spot (also from one level to the next, which is how
// a riser between floors is drawn). A pipe that merely passes over another of a different kind (cold over hot, gas over water) does not connect. Valves become nodes on the pipe
// they sit on. Water (cold and hot) and gas are separate networks and never mix. Pure: the node test runner loads this file directly.
import { levelIdOf } from "./levels.ts";
import { mediumOf, valveInfo, type Medium, type UtilityKind, type UtilityLine, type ValveRole } from "./utilities.ts";
import type { Item, Level } from "./types.ts";

/** Pipes (or a pipe end and another pipe) closer than this are joined: a hand-drawn plan is never exact. */
export const JOIN_TOL = 0.15;
/** A valve or meter this close to a pipe is on it. Bigger than JOIN_TOL because the piece has a body the pipe passes behind. */
export const VALVE_TOL = 0.4;
/** A sensor this far from every pipe has no pipe it can be traced to. */
export const REACH = 3;
/** Other pipes nearly as close as the nearest one count too (a sensor between two pipes). */
const TIE = 0.25;
const MAX_SOURCES = 4;

type PlanLike = { utilities?: UtilityLine[]; items: Item[]; levels?: Level[] };

export type ValveRef = {
  itemId: string;
  kind: string;
  role: ValveRole;
  /** The Home Assistant entity linked to it, when there is one: the valve or switch Doshy may close. */
  entity?: string;
  x: number;
  y: number;
  level: string;
};

export type GraphNode = { id: number; x: number; y: number; level: string; valves: ValveRef[] };
export type GraphEdge = { id: number; a: number; b: number; line: string; kind: UtilityKind; level: string; ax: number; ay: number; bx: number; by: number; len: number };
export type Graph = {
  medium: Medium;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Edge ids at each node. */
  adj: number[][];
  /** Valves and meters of this medium that are not on any pipe. */
  loose: ValveRef[];
};

type Cut = { t: number; x: number; y: number };
type Seg = { line: UtilityLine; level: string; ax: number; ay: number; bx: number; by: number; len: number; cuts: Cut[]; first: boolean; last: boolean };
type Rec = { x: number; y: number; level: string; end: boolean; valves: ValveRef[] };

const EPS = 1e-9;

type Projection = { t: number; x: number; y: number; d: number };

/** The point on segment a-b nearest to (px, py): its position along the segment (0..1) and the distance. */
function project(ax: number, ay: number, bx: number, by: number, px: number, py: number): Projection {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 < EPS ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2));
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { t, x, y, d: Math.hypot(px - x, py - y) };
}

/** Where two segments properly cross (not at an end of either), or null. */
function crossing(a: Seg, b: Seg): Cut | null {
  const rx = a.bx - a.ax, ry = a.by - a.ay, sx = b.bx - b.ax, sy = b.by - b.ay;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < EPS) return null;
  const t = ((b.ax - a.ax) * sy - (b.ay - a.ay) * sx) / den;
  const u = ((b.ax - a.ax) * ry - (b.ay - a.ay) * rx) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { t, x: a.ax + rx * t, y: a.ay + ry * t } : null;
}

const valveRef = (i: Item, plan: PlanLike): ValveRef | undefined => {
  const info = valveInfo(i.kind);
  return info ? { itemId: i.id, kind: i.kind, role: info.role, ...(i.entity ? { entity: i.entity } : {}), x: i.x, y: i.y, level: levelIdOf(plan, i) } : undefined;
};

function segmentsOf(plan: PlanLike, medium: Medium): Seg[] {
  const out: Seg[] = [];
  for (const line of plan.utilities ?? []) {
    if (mediumOf(line.kind) !== medium) continue;
    const level = levelIdOf(plan, line);
    for (let i = 0; i + 1 < line.pts.length; i++) {
      const [a, b] = [line.pts[i], line.pts[i + 1]];
      out.push({ line, level, ax: a.x, ay: a.y, bx: b.x, by: b.y, len: Math.hypot(b.x - a.x, b.y - a.y), cuts: [], first: i === 0, last: i + 2 === line.pts.length });
    }
  }
  return out;
}

/** Marks where pipes join: the cuts that split segments, so every junction becomes a vertex of both pipes. */
function findJunctions(segs: Seg[], tol: number): void {
  for (const s of segs) {
    for (const o of segs) {
      if (o.line === s.line || o.level !== s.level) continue;
      // an end of the other pipe lies on this segment: a branch
      for (const [isEnd, x, y] of [[o.first, o.ax, o.ay], [o.last, o.bx, o.by]] as const) {
        if (!isEnd) continue;
        const p = project(s.ax, s.ay, s.bx, s.by, x, y);
        if (p.d <= tol && p.t > 0 && p.t < 1) s.cuts.push({ t: p.t, x: p.x, y: p.y }); // within tol of an end of this segment, the cut and that vertex are one node anyway
      }
      // two pipes of the same kind that cross: a junction (counted once, from the segment with the smaller id order)
      if (o.line.kind === s.line.kind && o.line.id < s.line.id) {
        const c = crossing(s, o);
        if (c) {
          s.cuts.push(c);
          const back = crossing(o, s);
          if (back) o.cuts.push(back);
        }
      }
    }
  }
}

/** Puts each valve or meter on the nearest pipe of its medium (same level, within VALVE_TOL) as a cut, and returns the valves that are on no pipe. */
function placeValves(plan: PlanLike, segs: Seg[], medium: Medium, recs: Rec[]): ValveRef[] {
  const loose: ValveRef[] = [];
  for (const item of plan.items) {
    const ref = valveRef(item, plan);
    if (!ref || valveInfo(item.kind)?.medium !== medium) continue;
    let best: { seg: Seg; p: Projection } | null = null;
    for (const s of segs) {
      if (s.level !== ref.level) continue;
      const p = project(s.ax, s.ay, s.bx, s.by, ref.x, ref.y);
      if (p.d <= VALVE_TOL && (!best || p.d < best.p.d)) best = { seg: s, p };
    }
    if (!best) loose.push(ref);
    else {
      best.seg.cuts.push({ t: best.p.t, x: best.p.x, y: best.p.y });
      recs.push({ x: best.p.x, y: best.p.y, level: ref.level, end: false, valves: [ref] });
    }
  }
  return loose;
}

/** Union-find over points that are the same spot (within `tol`; across levels only for pipe ends, which is how a riser joins two floors). */
function cluster(recs: Rec[], tol: number): number[] {
  const parent = recs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const cells = new Map<string, number[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  recs.forEach((r, i) => {
    const cx = Math.floor(r.x / tol);
    const cy = Math.floor(r.y / tol);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of cells.get(key(cx + dx, cy + dy)) ?? []) {
          const o = recs[j];
          if (Math.hypot(r.x - o.x, r.y - o.y) <= tol && (r.level === o.level || (r.end && o.end))) parent[find(i)] = find(j);
        }
      }
    }
    const mine = cells.get(key(cx, cy));
    if (mine) mine.push(i);
    else cells.set(key(cx, cy), [i]);
  });
  return recs.map((_, i) => find(i));
}

/** The graph of one medium: nodes where pipes meet, end, or carry a valve; edges between them. */
export function buildGraph(plan: PlanLike, medium: Medium, tol: number = JOIN_TOL): Graph {
  const segs = segmentsOf(plan, medium);
  const valveRecs: Rec[] = [];
  findJunctions(segs, tol);
  const loose = placeValves(plan, segs, medium, valveRecs);
  // every sub-segment gets two point records; the valve records join the same clusters as the pipe points they sit on
  const recs: Rec[] = [...valveRecs];
  const pieces: { a: number; b: number; seg: Seg }[] = [];
  for (const s of segs) {
    const stops: Cut[] = [{ t: 0, x: s.ax, y: s.ay }, ...[...s.cuts].sort((p, q) => p.t - q.t), { t: 1, x: s.bx, y: s.by }];
    const ids = stops.map((c, k) => recs.push({ x: c.x, y: c.y, level: s.level, end: (k === 0 && s.first) || (k === stops.length - 1 && s.last), valves: [] }) - 1);
    for (let k = 0; k + 1 < ids.length; k++) pieces.push({ a: ids[k], b: ids[k + 1], seg: s });
  }
  const root = cluster(recs, tol);
  const nodeOf = new Map<number, number>();
  const nodes: GraphNode[] = [];
  recs.forEach((r, i) => {
    let n = nodeOf.get(root[i]);
    if (n === undefined) {
      n = nodes.length;
      nodeOf.set(root[i], n);
      nodes.push({ id: n, x: r.x, y: r.y, level: r.level, valves: [] });
    }
    for (const v of r.valves) if (!nodes[n].valves.some((x) => x.itemId === v.itemId)) nodes[n].valves.push(v);
  });
  const edges: GraphEdge[] = [];
  const adj: number[][] = nodes.map(() => []);
  for (const p of pieces) {
    const [a, b] = [nodeOf.get(root[p.a]), nodeOf.get(root[p.b])];
    if (a === undefined || b === undefined || a === b) continue;
    const [ra, rb] = [recs[p.a], recs[p.b]];
    const id = edges.length;
    edges.push({ id, a, b, line: p.seg.line.id, kind: p.seg.line.kind, level: p.seg.level, ax: ra.x, ay: ra.y, bx: rb.x, by: rb.y, len: Math.hypot(rb.x - ra.x, rb.y - ra.y) });
    adj[a].push(id);
    adj[b].push(id);
  }
  return { medium, nodes, edges, adj, loose };
}

// ---- tracing -----------------------------------------------------------------------------------------------------------------------------------------------

export type Target = { x: number; y: number; level: string; /** The room's rectangle, used when no pipe is near the point. */ room?: { x: number; y: number; w: number; h: number } };
export type ValveHit = ValveRef & { /** Metres of pipe from the sensor. */ distance: number };
export type Piece = { line: string; kind: UtilityKind; level: string; ax: number; ay: number; bx: number; by: number };

export type Trace = {
  medium: Medium;
  /** A pipe was found near enough to trace from. */
  found: boolean;
  /** The pipe reaches a main valve (whether or not valves are shut). */
  connected: boolean;
  /** Supply reaches the pipe right now (a main valve is open and no closed valve is in the way). */
  supplied: boolean;
  /** The main valves the pipe is fed from. */
  sources: ValveHit[];
  /** Valves that stop the supply on their own, closest to the sensor first. */
  cutters: ValveHit[];
  /** When no single valve stops it (a loop fed from two sides), every main valve to close. */
  closeAll: ValveHit[];
  /** Closed valves the supply meets on its way to this pipe: why it is already cut, and what to open again. */
  blockedBy: ValveHit[];
  /** The pipes between the sensor and each source, for the highlight. */
  pieces: Piece[];
};

const NOT_FOUND = (medium: Medium): Trace => ({ medium, found: false, connected: false, supplied: false, sources: [], cutters: [], closeAll: [], blockedBy: [], pieces: [] });

/** The edges nearest to the target: the closest pipe within REACH (and any nearly as close), else the pipes inside the room. */
function startEdges(g: Graph, t: Target): { edge: GraphEdge; da: number; db: number }[] {
  const near = g.edges.filter((e) => e.level === t.level).map((e) => ({ e, p: project(e.ax, e.ay, e.bx, e.by, t.x, t.y) }));
  const best = near.reduce((m, c) => Math.min(m, c.p.d), Infinity);
  if (best <= REACH) {
    return near.filter((c) => c.p.d <= best + TIE).map((c) => ({ edge: c.e, da: c.p.t * c.e.len, db: (1 - c.p.t) * c.e.len }));
  }
  const r = t.room;
  if (!r) return [];
  const inside = (x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  return g.edges.filter((e) => e.level === t.level && (inside(e.ax, e.ay) || inside(e.bx, e.by))).map((e) => ({ edge: e, da: e.len / 2, db: e.len / 2 }));
}

/** Is any open main valve reachable from the start nodes without passing a closed valve? */
function supplied(g: Graph, start: readonly number[], closed: ReadonlySet<string>): boolean {
  const blocked = (n: GraphNode) => n.valves.some((v) => closed.has(v.itemId));
  const seen = new Set<number>();
  const stack = start.filter((n) => !blocked(g.nodes[n]));
  for (const n of stack) seen.add(n);
  while (stack.length) {
    const n = stack.pop() as number;
    if (g.nodes[n].valves.some((v) => v.role === "main")) return true;
    for (const eid of g.adj[n]) {
      const e = g.edges[eid];
      const m = e.a === n ? e.b : e.a;
      if (!seen.has(m) && !blocked(g.nodes[m])) {
        seen.add(m);
        stack.push(m);
      }
    }
  }
  return false;
}

/** Shortest distances (metres of pipe) from the start nodes, and the edge each node was reached by. */
function distances(g: Graph, start: ReadonlyMap<number, number>): { dist: number[]; via: (number | null)[] } {
  const dist = g.nodes.map(() => Infinity);
  const via: (number | null)[] = g.nodes.map(() => null);
  const open = new Set<number>();
  for (const [n, d] of start) {
    dist[n] = Math.min(dist[n], d);
    open.add(n);
  }
  while (open.size) {
    let n = -1;
    for (const c of open) if (n < 0 || dist[c] < dist[n]) n = c;
    open.delete(n);
    for (const eid of g.adj[n]) {
      const e = g.edges[eid];
      const m = e.a === n ? e.b : e.a;
      if (dist[n] + e.len < dist[m]) {
        dist[m] = dist[n] + e.len;
        via[m] = eid;
        open.add(m);
      }
    }
  }
  return { dist, via };
}

const piece = (e: GraphEdge): Piece => ({ line: e.line, kind: e.kind, level: e.level, ax: e.ax, ay: e.ay, bx: e.bx, by: e.by });

/**
 * Follows the pipe nearest `target` back to where the supply comes in. `closed` holds the item ids of valves known to be shut (they block). The answer says which valves stop the
 * supply on their own (closest first), or, when the network is a loop fed from several main valves, that all of them have to be closed.
 */
export function traceFrom(g: Graph, target: Target, closed: ReadonlySet<string> = new Set()): Trace {
  const starts = startEdges(g, target);
  if (!starts.length) return NOT_FOUND(g.medium);
  const first = new Map<number, number>();
  for (const s of starts) {
    first.set(s.edge.a, Math.min(first.get(s.edge.a) ?? Infinity, s.da));
    first.set(s.edge.b, Math.min(first.get(s.edge.b) ?? Infinity, s.db));
  }
  const { dist, via } = distances(g, first);
  const hit = (v: ValveRef, n: number): ValveHit => ({ ...v, distance: Math.round(dist[n] * 100) / 100 });
  const reach = g.nodes.filter((n) => Number.isFinite(dist[n.id]));
  const mains = reach.flatMap((n) => n.valves.filter((v) => v.role === "main").map((v) => hit(v, n.id))).sort((a, b) => a.distance - b.distance);
  const startNodes = [...first.keys()];
  const feeds = supplied(g, startNodes, closed);
  const candidates = reach.flatMap((n) => n.valves.filter((v) => v.role !== "meter" && !closed.has(v.itemId)).map((v) => hit(v, n.id))).sort((a, b) => a.distance - b.distance);
  const cutters = feeds ? candidates.filter((v) => !supplied(g, startNodes, new Set([...closed, v.itemId]))) : [];
  const openMains = mains.filter((m) => !closed.has(m.itemId));
  const closeAll = feeds && !cutters.length ? openMains : [];
  // the pipes from the sensor to each main valve (shortest way), plus the pipe the sensor is on
  const edges = new Map<number, GraphEdge>(starts.map((s) => [s.edge.id, s.edge]));
  for (const m of mains.slice(0, MAX_SOURCES)) {
    let n = g.nodes.find((x) => x.valves.some((v) => v.itemId === m.itemId))?.id ?? -1;
    while (n >= 0 && via[n] !== null) {
      const e = g.edges[via[n] as number];
      edges.set(e.id, e);
      n = e.a === n ? e.b : e.a;
    }
  }
  const blockedBy = reach.flatMap((n) => n.valves.filter((v) => v.role !== "meter" && closed.has(v.itemId)).map((v) => hit(v, n.id))).sort((a, b) => a.distance - b.distance);
  return { medium: g.medium, found: true, connected: mains.length > 0, supplied: feeds, sources: mains, cutters, closeAll, blockedBy, pieces: [...edges.values()].map(piece) };
}
