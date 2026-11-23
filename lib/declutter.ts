// Screen-space declutter for the floating labels of the 3D scene (rings, badges, chips ...). Pure: no React, no three.js, no DOM.
// Feed it where every label would naturally sit (px) each frame; it answers how far to nudge each one so nothing overlaps, which labels
// are piled so tight that they fold into a numbered cluster, and how a tapped cluster fans out. Offsets and clusters are remembered between
// frames (hysteresis), so a label that has been moved stays moved while the camera orbits, and nothing flickers at a threshold.
// Rendering: components/scene/DeclutterLayer.tsx.

export type Anchor = {
  id: string;
  /** Natural centre of the label (px): where it sits when nothing is in the way. */
  x: number;
  y: number;
  /** The true spot in the scene the label points at (px); leader lines end here. */
  ax: number;
  ay: number;
  w: number;
  h: number;
  /** Size when shown in full, for a label that is a small dot right now: a fanned-out member is shown in full. */
  fw?: number;
  fh?: number;
  /** Higher stays put and stays on top. */
  priority: number;
  /** Labels never cluster across groups (a room id). */
  group?: string;
  /** Leak, smoke, an open door, an error: never clustered, never moved by others, always on top. */
  alert?: boolean;
};

export type Options = {
  /** false = leave every label at its natural spot (the user switched Declutter off). */
  on: boolean;
  /** Key of the cluster the user tapped open: its members fan out around it. */
  expanded?: string | null;
  /** Smallest touch target (px): fanned-out members keep this much room. */
  minTarget?: number;
  /** The viewport, to keep a fan inside it. */
  bounds?: { w: number; h: number };
};

export type Placed = {
  id: string;
  /** Offset from the natural centre (px). */
  dx: number;
  dy: number;
  /** Where the leader line goes: the true anchor, or the cluster marker for a fanned-out member. */
  lx: number;
  ly: number;
  /** Moved far enough that a leader line from the label back to its anchor is needed. */
  leader: boolean;
  /** Set on a member of the open cluster. */
  fan?: boolean;
};

type Cluster = {
  key: string;
  /** Natural centre, offset and true anchor of the marker, like a label. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  ax: number;
  ay: number;
  w: number;
  h: number;
  priority: number;
  count: number;
  members: string[];
  leader: boolean;
  open: boolean;
};

export type Result = {
  /** Every visible label (members of a closed cluster are not in here, those of the open one are, with `fan`). */
  placed: Map<string, Placed>;
  clusters: Cluster[];
};

export const GAP = 3; // px kept between two labels
const HYST = 6; // a label only goes home when its home is free by this much extra
const ITER = 10;
const MAX_OFFSET = 90;
const FORM_PAD = 2; // labels this close (px) to a seed are candidates for its cluster
const KEEP_PAD = 16; // ... and stay in it this much longer
const FORM_FILL = 0.55; // a cluster forms when the labels would fill this share of the room they have
const KEEP_FILL = 0.35; // ... and holds until they fill less than this
const SPREAD = 24; // room (px) the labels may spread to around their anchors
const LEADER_ON = 12;
const LEADER_OFF = 6;
const CLUSTER_W = 40;
const CLUSTER_H = 28;
const RADIAL_MAX = 8;
const RADIAL_MAX_W = 56;
const FAN_GAP = 6;

type Work = { id: string; x: number; y: number; ax: number; ay: number; w: number; h: number; fw?: number; fh?: number; p: number; m: number; dx: number; dy: number; group?: string; alert?: boolean; used?: boolean; row: number };
type Memo = { dx: number; dy: number; leader: boolean };

const overlaps = (ax: number, ay: number, a: Work, bx: number, by: number, b: Work, pad: number) =>
  Math.abs(bx - ax) < (a.w + b.w) / 2 + pad && Math.abs(by - ay) < (a.h + b.h) / 2 + pad;

export class Declutter {
  private memo = new Map<string, Memo>();
  private prevOf = new Map<string, string>(); // member id -> cluster key, last frame
  private prevKeys = new Set<string>();

  /** Forget everything (a new plan, or the user toggled Declutter). */
  reset() {
    this.memo.clear();
    this.prevOf.clear();
    this.prevKeys.clear();
  }

  update(anchors: readonly Anchor[], opts: Options): Result {
    const placed = new Map<string, Placed>();
    const clusters: Cluster[] = [];
    if (!opts.on) {
      this.reset();
      for (const a of anchors) placed.set(a.id, { id: a.id, dx: 0, dy: 0, lx: a.ax, ly: a.ay, leader: false });
      return { placed, clusters };
    }
    // most important first, id as the tie-break: the result never depends on registration order
    const work: Work[] = anchors
      .map((a) => ({ id: a.id, x: a.x, y: a.y, ax: a.ax, ay: a.ay, w: a.w, h: a.h, fw: a.fw, fh: a.fh, p: a.priority, m: a.priority + 1, dx: 0, dy: 0, group: a.group, alert: !!a.alert, row: 0 }))
      .sort((a, b) => b.p - a.p || (a.id < b.id ? -1 : 1));

    const { singles, formed } = this.cluster(work);
    const items = [...singles, ...formed.map((c) => c.item)];

    // restore last frame's offsets, then let labels whose home spot is free again go home
    for (const it of items) {
      const m = this.memo.get(it.id);
      if (m) ((it.dx = m.dx), (it.dy = m.dy));
    }
    this.release(items);
    this.relax(items);

    const next = new Map<string, Memo>();
    const finish = (it: Work) => {
      const old = this.memo.get(it.id);
      const d = Math.hypot(it.dx, it.dy);
      const leader = d > LEADER_ON || (!!old?.leader && d > LEADER_OFF);
      next.set(it.id, { dx: it.dx, dy: it.dy, leader });
      return leader;
    };
    for (const it of singles) {
      const leader = finish(it);
      placed.set(it.id, { id: it.id, dx: it.dx, dy: it.dy, lx: it.ax, ly: it.ay, leader });
    }
    this.prevOf.clear();
    this.prevKeys.clear();
    for (const { item, members } of formed) {
      const key = item.id;
      const leader = finish(item);
      const open = opts.expanded === key;
      clusters.push({ key, x: item.x, y: item.y, dx: item.dx, dy: item.dy, ax: item.ax, ay: item.ay, w: item.w, h: item.h, priority: item.p, count: members.length, members: members.map((m) => m.id), leader, open });
      this.prevKeys.add(key);
      for (const m of members) this.prevOf.set(m.id, key);
      if (open) this.fan(item, members, opts, placed);
    }
    this.memo = next;
    return { placed, clusters };
  }

  /** Pile labels that cannot be told apart into numbered markers. Seeds are the most important labels, so a cluster keeps its key while the camera moves. */
  private cluster(work: Work[]) {
    const cands = work.filter((w) => !w.alert);
    const formed: { item: Work; members: Work[] }[] = [];
    // neighbours of a seed lie within a band of rows around it: walk the labels sorted by y instead of testing every pair
    const rows = cands.slice().sort((a, b) => a.y - b.y);
    let maxH = 0;
    for (const c of cands) maxH = Math.max(maxH, c.h);
    rows.forEach((r, i) => (r.row = i));
    for (const seed of cands) {
      if (seed.used) continue;
      const head = this.prevKeys.has(seed.id);
      let near: Work[] | undefined;
      const band = (seed.h + maxH) / 2 + KEEP_PAD;
      const i0 = seed.row;
      for (let d = -1; d <= 1; d += 2) {
        for (let i = i0 + d; i >= 0 && i < rows.length && Math.abs(rows[i].y - seed.y) <= band; i += d) {
          const j = rows[i];
          if (j.used || j.group !== seed.group || !overlaps(seed.x, seed.y, seed, j.x, j.y, j, KEEP_PAD)) continue;
          if (!overlaps(seed.x, seed.y, seed, j.x, j.y, j, FORM_PAD) && this.prevOf.get(j.id) !== seed.id) continue; // the wider reach only holds members it already had
          (near ??= []).push(j);
        }
      }
      if (!near) continue;
      near.sort((a, b) => b.p - a.p || (a.id < b.id ? -1 : 1)); // most important first, whatever order the rows were walked in
      const members = [seed, ...near];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, need = 0;
      for (const m of members) {
        x0 = Math.min(x0, m.x - m.w / 2);
        x1 = Math.max(x1, m.x + m.w / 2);
        y0 = Math.min(y0, m.y - m.h / 2);
        y1 = Math.max(y1, m.y + m.h / 2);
        need += (m.w + GAP) * (m.h + GAP);
      }
      const have = (x1 - x0 + 2 * SPREAD) * (y1 - y0 + 2 * SPREAD);
      if (need < (head ? KEEP_FILL : FORM_FILL) * have) continue;
      for (const m of members) m.used = true;
      let mx = 0, my = 0, max = 0, may = 0;
      for (const m of members) ((mx += m.x), (my += m.y), (max += m.ax), (may += m.ay));
      const n = members.length;
      formed.push({
        members,
        item: { id: seed.id, x: mx / n, y: my / n, ax: max / n, ay: may / n, w: CLUSTER_W, h: CLUSTER_H, p: seed.p, m: seed.m, dx: 0, dy: 0, group: seed.group, row: 0 },
      });
    }
    return { singles: work.filter((w) => !w.used), formed };
  }

  /** A label that moved aside goes home as soon as its home is free (with a margin, so it does not flip back and forth). */
  private release(items: Work[]) {
    for (const a of items) {
      if (!a.dx && !a.dy) continue;
      let free = true;
      for (const b of items) {
        if (b === a) continue;
        if (overlaps(a.x, a.y, a, b.x + b.dx, b.y + b.dy, b, GAP + HYST)) {
          free = false;
          break;
        }
      }
      if (free) ((a.dx = 0), (a.dy = 0));
    }
  }

  /** Push overlapping labels apart along the shorter way out; the less important one gives way. Each pass walks the labels top to bottom and only meets the ones that start before the current one ends. */
  private relax(items: Work[]) {
    const n = items.length;
    const order = items.slice();
    for (let pass = 0; pass < ITER; pass++) {
      order.sort((a, b) => a.y + a.dy - a.h / 2 - (b.y + b.dy - b.h / 2));
      let moved = false;
      for (let i = 0; i < n; i++) {
        const a = order[i];
        const reach = a.y + a.dy + a.h / 2 + GAP; // a later label starting at or below this cannot touch a
        for (let j = i + 1; j < n; j++) {
          const b = order[j];
          const ax = a.x + a.dx, ay = a.y + a.dy, bx = b.x + b.dx, by = b.y + b.dy;
          if (by - b.h / 2 >= reach) break;
          const px = (a.w + b.w) / 2 + GAP - Math.abs(bx - ax);
          const py = (a.h + b.h) / 2 + GAP - Math.abs(by - ay);
          if (px <= 0 || py <= 0) continue;
          moved = true;
          const share = a.alert === b.alert ? b.m / (a.m + b.m) : a.alert ? 0 : 1; // the share of the move that falls on a; an alert never gives way to a plain label
          const vertical = py <= px;
          const s = (vertical ? by - ay : bx - ax) || (a.id < b.id ? 1 : -1); // exactly on top of each other: break the tie by id, the same way every frame
          const push = (vertical ? py : px) + 0.01;
          const k = s > 0 ? 1 : -1;
          if (vertical) ((a.dy -= k * push * share), (b.dy += k * push * (1 - share)));
          else ((a.dx -= k * push * share), (b.dx += k * push * (1 - share)));
        }
      }
      for (const it of items) {
        const d = Math.hypot(it.dx, it.dy);
        if (d > MAX_OFFSET) ((it.dx *= MAX_OFFSET / d), (it.dy *= MAX_OFFSET / d));
      }
      if (!moved) break;
    }
  }

  /** Lay the members of the open cluster around its marker: a ring when they are small and few, else a list beside it. Big enough to tap. */
  private fan(c: Work, members: Work[], opts: Options, out: Map<string, Placed>) {
    const t = opts.minTarget ?? 32;
    const cx = c.x + c.dx;
    const cy = c.y + c.dy;
    const list = members.length > RADIAL_MAX || members.some((m) => (m.fw ?? m.w) > RADIAL_MAX_W);
    const spots: [number, number][] = [];
    const sized = members.map((m) => ({ m, w: Math.max(m.fw ?? m.w, t), h: Math.max(m.fh ?? m.h, t) }));
    if (!list) {
      const r = Math.max(CLUSTER_W / 2 + t / 2 + FAN_GAP, Math.ceil((members.length * (t + FAN_GAP)) / (2 * Math.PI)));
      members.forEach((_, i) => {
        const ang = -Math.PI / 2 + (2 * Math.PI * i) / members.length;
        spots.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
      });
    } else {
      const total = sized.reduce((s, r) => s + r.h + FAN_GAP, -FAN_GAP);
      const left = cx + CLUSTER_W / 2 + FAN_GAP + 8;
      let y = cy - total / 2;
      for (const r of sized) {
        spots.push([left + r.w / 2, y + r.h / 2]);
        y += r.h + FAN_GAP;
      }
    }
    const b = opts.bounds;
    if (b) {
      // slide the whole fan back inside the viewport
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      spots.forEach(([x, y], i) => {
        x0 = Math.min(x0, x - sized[i].w / 2);
        x1 = Math.max(x1, x + sized[i].w / 2);
        y0 = Math.min(y0, y - sized[i].h / 2);
        y1 = Math.max(y1, y + sized[i].h / 2);
      });
      const sx = x0 < 4 ? 4 - x0 : x1 > b.w - 4 ? b.w - 4 - x1 : 0;
      const sy = y0 < 4 ? 4 - y0 : y1 > b.h - 4 ? b.h - 4 - y1 : 0;
      for (const s of spots) ((s[0] += sx), (s[1] += sy));
    }
    members.forEach((m, i) => out.set(m.id, { id: m.id, dx: spots[i][0] - m.x, dy: spots[i][1] - m.y, lx: cx, ly: cy, leader: true, fan: true }));
  }
}
