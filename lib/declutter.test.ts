import test from "node:test";
import assert from "node:assert/strict";
import { Declutter, GAP, type Anchor, type Result } from "./declutter.ts";

const lab = (id: string, x: number, y: number, o: Partial<Anchor> = {}): Anchor => ({ id, x, y, ax: x, ay: y + 20, w: 60, h: 20, priority: 30, ...o });
const ON = { on: true } as const;

/** Largest overlap (px, 0 = none) between any two shown labels after the offsets are applied. */
function worstOverlap(anchors: Anchor[], r: Result) {
  const boxes = anchors.flatMap((a) => {
    const p = r.placed.get(a.id);
    return p ? [{ x: a.x + p.dx, y: a.y + p.dy, w: a.w, h: a.h }] : [];
  }).concat(r.clusters.map((c) => ({ x: c.x + c.dx, y: c.y + c.dy, w: c.w, h: c.h })));
  let worst = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
      const oy = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
      if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy));
    }
  return worst;
}

test("labels that do not touch stay exactly where they are", () => {
  const a = [lab("a", 100, 100), lab("b", 300, 100), lab("c", 100, 300)];
  const r = new Declutter().update(a, ON);
  for (const l of a) assert.deepEqual([r.placed.get(l.id)!.dx, r.placed.get(l.id)!.dy], [0, 0]);
  assert.equal(r.clusters.length, 0);
});

test("two labels on the same spot are pushed apart, the less important one moves more", () => {
  const a = [lab("hi", 100, 100, { priority: 60 }), lab("lo", 100, 100, { priority: 20 })];
  const r = new Declutter().update(a, ON);
  assert.ok(worstOverlap(a, r) <= 0.5);
  const hi = r.placed.get("hi")!, lo = r.placed.get("lo")!;
  assert.ok(Math.hypot(lo.dx, lo.dy) > Math.hypot(hi.dx, hi.dy));
  assert.ok(lo.leader || Math.hypot(lo.dx, lo.dy) < 12);
});

test("a dense but separable grid ends with no overlaps and bounded offsets", () => {
  const a: Anchor[] = [];
  for (let i = 0; i < 30; i++) a.push(lab(`s${i}`, 200 + (i % 6) * 34, 200 + Math.floor(i / 6) * 17 + (i % 3)));
  const r = new Declutter().update(a, ON);
  // density is high: whatever did not fold into a cluster must not overlap
  assert.ok(worstOverlap(a, r) <= GAP, `overlap ${worstOverlap(a, r)}`);
  for (const p of r.placed.values()) assert.ok(Math.hypot(p.dx, p.dy) <= 90.5);
});

test("alerts never join a cluster and never give way to a non-alert", () => {
  const a = [lab("leak", 100, 100, { alert: true, priority: 100 })];
  for (let i = 0; i < 8; i++) a.push(lab(`n${i}`, 100 + (i % 2), 100 + (i % 3)));
  const r = new Declutter().update(a, ON);
  const leak = r.placed.get("leak")!;
  assert.deepEqual([leak.dx, leak.dy], [0, 0]);
  assert.ok(r.clusters.every((c) => !c.members.includes("leak")));
  assert.ok(r.clusters.length >= 1);
  assert.ok(worstOverlap(a, r) <= GAP);
});

test("a pile on one spot folds into a numbered cluster; a pair does not", () => {
  const pile = Array.from({ length: 7 }, (_, i) => lab(`p${i}`, 150, 150, { priority: 30 - i }));
  const r = new Declutter().update(pile, ON);
  assert.equal(r.clusters.length, 1);
  assert.equal(r.clusters[0].count, 7);
  assert.equal(r.clusters[0].key, "p0"); // the most important label seeds it
  assert.equal(r.placed.size, 0);
  const pair = new Declutter().update(pile.slice(0, 2), ON);
  assert.equal(pair.clusters.length, 0);
  assert.equal(pair.placed.size, 2);
});

test("with Declutter off nothing moves and nothing clusters", () => {
  const pile = Array.from({ length: 7 }, (_, i) => lab(`p${i}`, 150, 150));
  const r = new Declutter().update(pile, { on: false });
  assert.equal(r.clusters.length, 0);
  for (const p of r.placed.values()) assert.deepEqual([p.dx, p.dy], [0, 0]);
});

test("labels in different groups never share a cluster", () => {
  const a = [...Array.from({ length: 4 }, (_, i) => lab(`k${i}`, 80, 80, { group: "kitchen" })), ...Array.from({ length: 4 }, (_, i) => lab(`b${i}`, 80, 80, { group: "bath" }))];
  const r = new Declutter().update(a, ON);
  for (const c of r.clusters) assert.ok(new Set(c.members.map((m) => m[0])).size === 1);
});

test("a cluster dissolves when the camera zooms in, and holds a little longer than it took to form", () => {
  const spread = (s: number) => Array.from({ length: 6 }, (_, i) => lab(`z${i}`, 300 + (i % 3) * s, 300 + Math.floor(i / 3) * s * 0.4, { priority: 30 - i }));
  const d = new Declutter();
  assert.equal(d.update(spread(1), ON).clusters.length, 1);
  assert.equal(d.update(spread(70), ON).clusters.length, 0, "zoomed in: separate labels again");
  // hysteresis: a spread that would not make a fresh cluster keeps an existing one
  const mid = spread(50);
  assert.equal(new Declutter().update(mid, ON).clusters.length, 0, "fresh engine: not dense enough to form");
  const held = new Declutter();
  held.update(spread(1), ON);
  assert.equal(held.update(mid, ON).clusters.length, 1, "already clustered: held");
});

test("no jitter: a slow orbit (tiny shifts) never re-shuffles labels that have settled", () => {
  const base = Array.from({ length: 20 }, (_, i) => lab(`j${i}`, 200 + (i % 5) * 30, 200 + Math.floor(i / 5) * 12, { priority: 20 + (i % 4) * 10 }));
  const d = new Declutter();
  let prev = d.update(base, ON);
  let worstStep = 0;
  for (let f = 1; f <= 60; f++) {
    const sx = f * 0.37; // the whole scene drifts by a third of a pixel per frame
    const a = base.map((l) => ({ ...l, x: l.x + sx, ax: l.ax + sx }));
    const r = d.update(a, ON);
    for (const [id, p] of r.placed) {
      const q = prev.placed.get(id);
      if (q) worstStep = Math.max(worstStep, Math.abs(p.dx - q.dx), Math.abs(p.dy - q.dy));
    }
    assert.equal(r.clusters.length, prev.clusters.length, `cluster count flipped at frame ${f}`);
    prev = r;
  }
  assert.ok(worstStep < 3, `labels jumped ${worstStep}px between frames`);
});

test("an opened cluster fans its members out with room to tap, away from each other", () => {
  const pile = Array.from({ length: 6 }, (_, i) => lab(`f${i}`, 200, 200, { w: 32, h: 32, priority: 30 - i }));
  const d = new Declutter();
  const closed = d.update(pile, ON);
  const key = closed.clusters[0].key;
  const r = d.update(pile, { ...ON, expanded: key, minTarget: 44, bounds: { w: 800, h: 600 } });
  assert.equal(r.placed.size, 6);
  assert.ok(r.clusters[0].open);
  const spots = [...r.placed.values()].map((p) => ({ x: 200 + p.dx, y: 200 + p.dy }));
  for (let i = 0; i < spots.length; i++)
    for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) >= 44, "tap targets overlap");
  assert.ok([...r.placed.values()].every((p) => p.fan));
});

test("a long list of wide members fans out as a column that stays inside the viewport", () => {
  const pile = Array.from({ length: 8 }, (_, i) => lab(`w${i}`, 780, 40, { w: 90, h: 22, priority: 30 - i }));
  const d = new Declutter();
  const key = d.update(pile, ON).clusters[0].key;
  const r = d.update(pile, { ...ON, expanded: key, minTarget: 44, bounds: { w: 800, h: 600 } });
  for (const p of r.placed.values()) {
    const x = 780 + p.dx, y = 40 + p.dy;
    assert.ok(x - 45 >= 3 && x + 45 <= 797 && y - 22 >= 3 && y + 22 <= 597, `fan member out of the viewport at ${x},${y}`);
  }
});
