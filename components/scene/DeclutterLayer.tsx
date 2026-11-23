"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useId, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Vector3, type Camera, type Object3D, type WebGLRenderer } from "three";
import { Declutter, type Anchor, type Result } from "@/lib/declutter";
import { roomIdAt } from "@/lib/rooms";
import { isolationOf, markerInZone, type Zone } from "@/lib/roomIsolate";
import { useStore } from "@/lib/store";
import { occluded, type Slab } from "@/lib/occlusion";
import { WALL_CUT_H, WALL_H, WALL_T } from "@/lib/geometry";
import { wallHeight } from "@/lib/fences";
import { elevationOf, levelIdOf } from "@/lib/levels";
import type { Plan } from "@/lib/types";
import { useDeclutter } from "./declutterState";
import { useReducedMotion } from "./motion";
import { useLevelVisibility } from "./levelState";
import { clamp } from "@/lib/mathUtil";
import "./declutter.css";

/** The plan's walls as slabs for the behind-a-wall test: full height, or the cut-away height on the storey being worked on; glass lets you see through; hidden storeys draw none. */
function wallSlabs(plan: Plan, cutaway: boolean, activeId: string, visible: Record<string, boolean>): Slab[] {
  const out: Slab[] = [];
  for (const w of plan.walls) {
    const lv = levelIdOf(plan, w);
    const dx = w.b.x - w.a.x;
    const dz = w.b.y - w.a.y;
    const len = Math.hypot(dx, dz);
    if (visible[lv] === false || w.style === "glass" || w.style === "fence_wire" || len < 1e-6) continue;
    const y0 = elevationOf(plan, lv);
    out.push({ x: w.a.x, z: w.a.y, ux: dx / len, uz: dz / len, len, r: (w.thickness ?? WALL_T) / 2, y0, y1: y0 + Math.min(wallHeight(w, WALL_H), cutaway && lv === activeId ? WALL_CUT_H : Infinity) });
  }
  return out;
}

/**
 * Every floating device label of the 3D scene (rings, badges, chips, link marks, flow labels) is a <Marker>. Markers only register
 * themselves; the one <DeclutterLayer> projects them all each frame, runs lib/declutter.ts and writes the positions straight to the DOM
 * (no React render per frame). It also culls what is off screen or on a hidden storey, shrinks calm sensors to dots until you zoom in or
 * focus the room, folds piles into numbered cluster markers, and draws leader lines from displaced labels back to their devices.
 */

type MarkerKind = "ring" | "sensor" | "run" | "badge" | "camera" | "link" | "flow" | "chip";
/** Higher stays put and is drawn on top. Alerts add ALERT_BOOST. */
const PRIORITY: Record<MarkerKind, number> = { ring: 60, camera: 50, chip: 45, run: 40, flow: 35, sensor: 30, badge: 30, link: 20 };
const ALERT_BOOST = 100;
const OPEN_PRIORITY = 80;
const FAN_Z = 300;
/** Labels that sit right on their device (no stem above it). */
const CENTERED: readonly MarkerKind[] = ["ring", "link", "flow"];
const STEM = 12; // px between a label's bottom edge and its device (the CSS stem draws it)
const DOT_PX = 18;
const TOUCH_PX = 44;
const ZOOM_IN = 75; // px per metre: from here a calm sensor shows its full badge
const ZOOM_OUT = 64;
const CULL_MARGIN = 40;
const SMOOTH = 16; // 1/s: how quickly a label slides to a new spot
const LEADER_SLACK = 1;

type Entry = {
  id: string;
  host: HTMLDivElement;
  body: HTMLDivElement;
  pip: HTMLButtonElement;
  g: SVGGElement; // leader line + anchor dot
  line: SVGLineElement;
  dot: SVGCircleElement;
  obj: Object3D | null;
  kind: MarkerKind;
  priority: number;
  alert: boolean;
  dotColor?: string;
  group?: string;
  // measured full size
  w: number;
  h: number;
  // runtime
  room?: string;
  // world position the room was last worked out for
  wx: number;
  wy: number;
  wz: number;
  tx: number; // transform last written
  ty: number;
  lw: number; // full size the last frame saw
  lh: number;
  sx: number;
  sy: number;
  anchor: Anchor; // what the engine sees, rewritten in place each frame
  occ: boolean; // behind a wall as seen from the camera
  occV: number; // sight-line version `occ` was worked out for
  inView: boolean; // passed the culls last frame
  seen: boolean; // shown right now (a member folded into a closed cluster is in view but not shown)
  vis: boolean;
  cDot: boolean; // wanted: a dot
  aDot: boolean; // applied to the DOM
  cFan: boolean;
  cLead: boolean;
  cOpen: boolean;
  aOpen: boolean;
  z: number;
};

const SVG = "http://www.w3.org/2000/svg";
const entries = new Set<Entry>();
const sizes = new WeakMap<Element, Entry>();
/** What the user opened: a calm sensor shown in full, or a cluster fanned out. Cleared by a tap elsewhere or Escape. */
const ui: { open: string | null; expanded: string | null } = { open: null, expanded: null };

let ro: ResizeObserver | null = null;
function observe(e: Entry) {
  ro ??= new ResizeObserver((list) => {
    for (const r of list) {
      const en = sizes.get(r.target);
      const b = r.borderBoxSize?.[0];
      if (en && b && b.inlineSize > 0 && b.blockSize > 0) ((en.w = b.inlineSize), (en.h = b.blockSize)); // hidden (a dot) reads 0: keep the last full size
    }
  });
  sizes.set(e.body, e);
  ro.observe(e.body);
}

/** The layer element inside the canvas wrapper (made on first use, so markers and the layer can mount in any order). */
function layerOf(parent: HTMLElement) {
  let el = parent.querySelector<HTMLElement>(":scope > .dc-layer");
  if (!el) {
    el = document.createElement("div");
    el.className = "dc-layer";
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "dc-leaders");
    svg.setAttribute("aria-hidden", "true");
    el.appendChild(svg);
    parent.appendChild(el);
  }
  return el;
}
const leadersOf = (layer: HTMLElement) => layer.firstElementChild as SVGSVGElement;

type Leader = { g: SVGGElement; line: SVGLineElement; dot: SVGCircleElement };

function makeLeader(): Leader {
  const g = document.createElementNS(SVG, "g");
  const line = document.createElementNS(SVG, "line");
  const dot = document.createElementNS(SVG, "circle");
  dot.setAttribute("r", "2.5");
  g.append(line, dot);
  g.style.display = "none";
  return { g, line, dot };
}

function makeEntry(id: string): Entry {
  const host = document.createElement("div");
  host.className = "dc-host";
  const body = document.createElement("div");
  body.className = "dc-body";
  const pip = document.createElement("button");
  pip.type = "button";
  pip.className = "dc-pip";
  host.append(body, pip);
  const e: Entry = {
    id, host, body, pip, ...makeLeader(), obj: null, kind: "badge", priority: PRIORITY.badge, alert: false, w: 72, h: 24,
    wx: NaN, wy: NaN, wz: NaN, tx: NaN, ty: NaN, lw: 0, lh: 0, sx: 0, sy: 0, occ: false, occV: -1, inView: false, seen: false, vis: true, cDot: false, aDot: false, cFan: false, cLead: false, cOpen: false, aOpen: false, z: -1,
    anchor: { id, x: 0, y: 0, ax: 0, ay: 0, w: 0, h: 0, priority: 0 },
  };
  pip.addEventListener("click", () => void (ui.open = id));
  host.style.visibility = "hidden";
  e.vis = false;
  return e;
}

type MarkerProps = {
  /** World position (metres) the label points at; give it the point above the device. */
  position: [number, number, number];
  kind: MarkerKind;
  children: ReactNode;
  /** Stable id (an item id plus a role); the cluster keys and the user's opened cluster follow it across re-renders. */
  id?: string;
  /** Leak, smoke, an open door, an error: never clustered, never collapsed, always on top. */
  alert?: boolean;
  /** Set (a colour) while the label is calm and may shrink to a status dot; leave undefined when its state is worth reading. */
  dot?: string;
  /** What the dot says to a screen reader / tooltip ("Temperature 21.5 C"). */
  label?: string;
  /** Overrides the room the label is grouped under (default: the room under it). */
  group?: string;
};

/**
 * A floating label pinned to a 3D position, managed by DeclutterLayer. Same idea as SceneHtml (own React root, deferred unmount so React 19
 * does not log a nested-root warning) but placement, culling, level of detail and clustering belong to the layer.
 */
export function Marker({ position, kind, children, id, alert = false, dot, label, group }: MarkerProps) {
  const anchor = useRef<Object3D>(null);
  const rootRef = useRef<Root | null>(null);
  const gl = useThree((s) => s.gl);
  const auto = useId();
  const key = id ?? auto;
  const entry = useMemo(() => makeEntry(key), [key]);
  entry.kind = kind;
  entry.alert = alert;
  entry.priority = PRIORITY[kind] + (alert ? ALERT_BOOST : 0);
  entry.dotColor = dot;
  entry.group = group;

  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    const layer = layerOf(parent);
    layer.appendChild(entry.host);
    leadersOf(layer).appendChild(entry.g);
    entry.obj = anchor.current;
    entries.add(entry);
    observe(entry);
    const root = createRoot(entry.body);
    rootRef.current = root;
    root.render(children);
    return () => {
      entries.delete(entry);
      ro?.unobserve(entry.body);
      rootRef.current = null;
      entry.host.remove();
      entry.g.remove();
      setTimeout(() => root.unmount(), 0);
    };
    // children are re-rendered by the effect below; the root itself only depends on the canvas and this entry
  }, [gl, entry]);

  useEffect(() => {
    rootRef.current?.render(children);
    entry.pip.style.setProperty("--dc", dot ?? "#8a98a3");
    const text = label ?? "Device";
    entry.pip.setAttribute("aria-label", `${text}. Show details`);
    entry.pip.title = text;
  });

  return <object3D ref={anchor} position={position} />;
}

const num = (v: number) => v.toFixed(1);

function drawLeader(l: Leader, ax: number, ay: number, cx: number, cy: number, w: number, h: number) {
  const nx = clamp(ax, cx - w / 2, cx + w / 2);
  const ny = clamp(ay, cy - h / 2, cy + h / 2);
  if (Math.abs(nx - ax) < LEADER_SLACK && Math.abs(ny - ay) < LEADER_SLACK) return void (l.g.style.display = "none");
  l.g.style.display = "";
  l.line.setAttribute("x1", num(ax));
  l.line.setAttribute("y1", num(ay));
  l.line.setAttribute("x2", num(nx));
  l.line.setAttribute("y2", num(ny));
  l.dot.setAttribute("cx", num(ax));
  l.dot.setAttribute("cy", num(ay));
}

type ClusterEl = Leader & { btn: HTMLButtonElement; n: number; open: boolean; live: boolean; tx: number; ty: number };
const clusterEls = new Map<string, ClusterEl>();

function clusterEl(layer: HTMLElement, key: string): ClusterEl {
  let c = clusterEls.get(key);
  if (!c) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dc-cluster";
    btn.addEventListener("click", () => void (ui.expanded = ui.expanded === key ? null : key));
    layer.appendChild(btn);
    const l = makeLeader();
    leadersOf(layer).appendChild(l.g);
    c = { ...l, btn, n: -1, open: false, live: true, tx: NaN, ty: NaN };
    clusterEls.set(key, c);
  }
  return c;
}

const P = new Vector3();
const DIR = new Vector3();

declare global {
  interface Window {
    __declutter?: { avg: number; max: number; last: number; moving: number; engine: number; markers: number; zoom: number };
  }
}

/** Dev-only frame cost of the update below (`window.__declutter`, ms): `avg` / `max` over the last 120 frames, `moving` = average of the frames where something moved (the idle ones skip the layout), `engine` = of those, the layout alone. */
const cost = { all: new Float32Array(120), mov: new Float32Array(120), eng: new Float32Array(120), i: 0, m: 0 };
function record(ms: number, count: number, zoom: number, moved: boolean, engineMs: number) {
  cost.all[cost.i++ % 120] = ms;
  if (moved) ((cost.mov[cost.m % 120] = ms), (cost.eng[cost.m++ % 120] = engineMs));
  const mean = (a: Float32Array, n: number) => {
    let s = 0;
    for (let k = 0; k < n; k++) s += a[k];
    return n ? s / n : 0;
  };
  const n = Math.min(cost.i, 120);
  const nm = Math.min(cost.m, 120);
  window.__declutter = { avg: mean(cost.all, n), max: Math.max(...cost.all.subarray(0, n)), last: ms, moving: mean(cost.mov, nm), engine: mean(cost.eng, nm), markers: count, zoom };
}

/** Writes each placed label's smoothed offset and classes to the DOM (only what changed); true while any slide is still settling. */
function placeAnchors(items: Entry[], anch: Anchor[], res: Result, k: number): boolean {
  let settling = false;
  for (let i = 0; i < anch.length; i++) {
    const a = anch[i];
    const e = items[i];
    const p = res.placed.get(a.id);
    if (!p) {
      e.seen = false; // folded into a closed cluster
      continue;
    }
    if (!e.vis) ((e.sx = p.dx), (e.sy = p.dy));
    else {
      e.sx += (p.dx - e.sx) * k;
      e.sy += (p.dy - e.sy) * k;
      if (Math.abs(p.dx - e.sx) > 0.05 || Math.abs(p.dy - e.sy) > 0.05) settling = true;
    }
    const x = a.x + e.sx;
    const y = a.y + e.sy;
    const style = e.host.style;
    if (!(Math.abs(x - e.tx) <= 0.05 && Math.abs(y - e.ty) <= 0.05)) {
      ((e.tx = x), (e.ty = y));
      style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    }
    const z = p.fan ? FAN_Z : a.priority;
    if (z !== e.z) ((e.z = z), (style.zIndex = String(z)));
    if (!e.vis) ((e.vis = true), (style.visibility = "visible"));
    const lead = p.leader;
    if (lead !== e.cLead) ((e.cLead = lead), e.host.classList.toggle("dc-lead", lead));
    if (lead) drawLeader(e, p.lx, p.ly, x, y, p.fan ? (a.fw ?? a.w) : a.w, p.fan ? (a.fh ?? a.h) : a.h);
    else if (e.g.style.display !== "none") e.g.style.display = "none";
    if (p.fan !== e.cFan) ((e.cFan = !!p.fan), e.host.classList.toggle("dc-fan", !!p.fan));
    const dot = e.cDot && !p.fan; // a fanned-out sensor shows in full: that is the point of opening the pile
    if (dot !== e.aDot) ((e.aDot = dot), e.host.classList.toggle("dc-dot", dot));
    if (e.cOpen !== e.aOpen) ((e.aOpen = e.cOpen), e.host.classList.toggle("dc-open", e.cOpen));
  }
  return settling;
}

/** Labels that were shown last frame but are not placed now: hidden. */
function hideUnplaced() {
  for (const e of entries) {
    if (e.seen || !e.vis) continue;
    e.vis = false;
    e.host.style.visibility = "hidden";
    e.g.style.display = "none";
  }
}

/** Syncs the "+N" cluster buttons with the engine's clusters (creates, moves, retires); true when one is fanned open. */
function syncClusters(layer: HTMLElement, clusters: Result["clusters"]): boolean {
  let fanned = false;
  for (const el of clusterEls.values()) el.live = false;
  for (const c of clusters) {
    const el = clusterEl(layer, c.key);
    el.live = true;
    const x = c.x + c.dx;
    const y = c.y + c.dy;
    if (!(Math.abs(x - el.tx) <= 0.05 && Math.abs(y - el.ty) <= 0.05)) {
      ((el.tx = x), (el.ty = y));
      el.btn.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
    }
    if (el.n !== c.count) {
      el.n = c.count;
      el.btn.textContent = `+${c.count}`;
      el.btn.setAttribute("aria-label", `${c.count} devices bunched here. Show them`);
    }
    if (el.open !== c.open) {
      el.open = c.open;
      el.btn.setAttribute("aria-expanded", String(c.open));
    }
    el.btn.style.zIndex = String(c.open ? FAN_Z + 1 : c.priority);
    fanned ||= c.open;
    if (c.leader) drawLeader(el, c.ax, c.ay, x, y, c.w, c.h);
    else el.g.style.display = "none";
  }
  for (const [key, c] of clusterEls) {
    if (c.live) continue;
    c.btn.remove();
    c.g.remove();
    clusterEls.delete(key);
    if (ui.expanded === key) ui.expanded = null;
  }
  return fanned;
}

/** What one frame's marker pass reads: the camera, the view, the sight line and the walls to test it against. */
type Gather = {
  cam: Camera;
  W: number;
  H: number;
  plan: Plan;
  focusRoom: string | null;
  declutter: boolean;
  zoomedIn: boolean;
  minPx: number;
  dotPx: number;
  zone: Zone | undefined;
  ov: Sight;
  slabs: Slab[];
  items: Entry[];
  anch: Anchor[];
};
/** The sight line toward the camera, and which walls it was tested against. */
type Sight = { v: number; tx: number; ty: number; tz: number; slabs: Slab[] | null };

/** Whether marker `e` is in sight (its storey shown, in the isolated room, not behind a wall, in front of the camera); when it is, its projected position is left in `P`. */
function projectIfShown(e: Entry, o: Object3D, g: Gather): boolean {
  const { cam, plan, declutter, zone, ov, slabs } = g;
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false; // a hidden storey takes its labels with it
  P.setFromMatrixPosition(o.matrixWorld);
  if (!(Math.abs(P.x - e.wx) <= 0.005 && Math.abs(P.y - e.wy) <= 0.005 && Math.abs(P.z - e.wz) <= 0.005)) {
    ((e.wx = P.x), (e.wy = P.y), (e.wz = P.z));
    e.room = roomIdAt(plan, P.x, P.z, P.y);
    e.occV = -1;
  }
  if (zone && !markerInZone(zone, P.x, P.y, P.z)) return false; // Room mode: only the isolated room's labels
  if (declutter && !zone && !e.alert && e.kind !== "chip") {
    // behind a wall as seen from the camera: not drawn (alerts and room names always are)
    if (e.occV !== ov.v) ((e.occ = occluded(P.x, P.y, P.z, ov.tx, ov.ty, ov.tz, slabs)), (e.occV = ov.v));
    if (e.occ) return false;
  }
  P.project(cam);
  return P.z <= 1 && P.z >= -1;
}

/** Projects every marker, culls the ones out of sight and fills `items` / `anch` with the rest; true when any marker moved, resized or changed class. */
function gatherAnchors(g: Gather): boolean {
  const { W, H, focusRoom, declutter, zoomedIn, minPx, dotPx, items, anch } = g;
  let dirty = false;
  for (const e of entries) {
    const was = e.inView;
    e.inView = false;
    e.seen = false;
    const o = e.obj;
    if (!o) continue;
    const shown = projectIfShown(e, o, g);
    const sx = (P.x * 0.5 + 0.5) * W;
    const sy = (-P.y * 0.5 + 0.5) * H;
    if (!shown || sx < -CULL_MARGIN || sx > W + CULL_MARGIN || sy < -CULL_MARGIN || sy > H + CULL_MARGIN) {
      if (was) dirty = true;
      continue;
    }
    e.inView = true;
    const group = e.group ?? e.room;
    const open = ui.open === e.id;
    const calm = e.dotColor !== undefined && !e.alert;
    const dotted = declutter && calm && !(zoomedIn || open || (!!focusRoom && group === focusRoom));
    const centered = dotted || CENTERED.includes(e.kind);
    const w = dotted ? dotPx : Math.max(e.w, minPx);
    const h = dotted ? dotPx : Math.max(e.h, minPx);
    const ny = centered ? sy : sy - STEM - e.h / 2;
    const prio = open ? OPEN_PRIORITY : e.priority;
    const a = e.anchor;
    const opened = open && e.dotColor !== undefined;
    if (!was || dotted !== e.cDot || opened !== e.cOpen || Math.abs(sx - a.ax) > 0.05 || Math.abs(sy - a.ay) > 0.05 || Math.abs(ny - a.y) > 0.05 || w !== a.w || h !== a.h || prio !== a.priority || group !== a.group || e.w !== e.lw || e.h !== e.lh) dirty = true;
    e.cDot = dotted;
    e.cOpen = opened;
    e.lw = e.w;
    e.lh = e.h;
    e.seen = true;
    a.x = sx;
    a.y = ny;
    a.ax = sx;
    a.ay = sy;
    a.w = w;
    a.h = h;
    a.fw = dotted ? Math.max(e.w, minPx) : undefined;
    a.fh = dotted ? Math.max(e.h, minPx) : undefined;
    a.priority = prio;
    a.group = group;
    a.alert = e.alert;
    items.push(e);
    anch.push(a);
  }
  return dirty;
}

/** The sight line toward the camera (opposite its view direction): bumps `ov.v` when the camera turned or the walls to test against changed. */
function trackSight(ov: Sight, cam: Camera, slabs: Slab[]) {
  cam.getWorldDirection(DIR);
  if (Math.abs(ov.tx + DIR.x) + Math.abs(ov.ty + DIR.y) + Math.abs(ov.tz + DIR.z) > 1e-4 || ov.slabs !== slabs) {
    ((ov.tx = -DIR.x), (ov.ty = -DIR.y), (ov.tz = -DIR.z), (ov.slabs = slabs));
    ov.v++;
  }
}

/** Puts the engine's layout on screen: the placed labels, the cluster buttons and the fanned flag; true while a slide is still settling. */
function showLayout(layer: HTMLElement, items: Entry[], anch: Anchor[], res: Result, k: number): boolean {
  const settling = placeAnchors(items, anch, res, k);
  hideUnplaced();
  layer.classList.toggle("dc-fanned", syncClusters(layer, res.clusters));
  return settling;
}

/** Finds (or makes) the label layer in the canvas wrapper, tracks the coarse pointer, closes opened dots on a tap elsewhere or Escape, and tears the cluster buttons down. */
function useLayerLifecycle(gl: WebGLRenderer, layerRef: MutableRefObject<HTMLElement | null>, touch: MutableRefObject<boolean>) {
  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (parent) layerRef.current = layerOf(parent);
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => void (touch.current = mq.matches);
    sync();
    mq.addEventListener("change", sync);
    // a tap anywhere but on an opened dot, cluster or fan closes them
    const away = (ev: Event) => {
      if (!ui.open && !ui.expanded) return;
      if (ev.target instanceof Element && ev.target.closest(".dc-open, .dc-cluster, .dc-fan")) return;
      ui.open = ui.expanded = null;
    };
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && (ui.open || ui.expanded) && (ui.open = ui.expanded = null);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
      for (const c of clusterEls.values()) (c.btn.remove(), c.g.remove());
      clusterEls.clear();
      layerRef.current = null;
    };
  }, [gl]);
}

/** Mount once inside the Canvas, after the camera rig. */
export default function DeclutterLayer() {
  const engine = useMemo(() => new Declutter(), []);
  const gl = useThree((s) => s.gl);
  const reduced = useReducedMotion();
  const zoomedIn = useRef(false);
  const touch = useRef(false);
  const layerRef = useRef<HTMLElement | null>(null);
  const on = useDeclutter((s) => s.on);
  const plan = useStore((s) => s.plan);

  useLayerLifecycle(gl, layerRef, touch);

  // a new plan or the switch flipping starts the layout afresh
  useEffect(() => {
    engine.reset();
    ui.open = ui.expanded = null;
  }, [engine, on, plan.rooms]);

  const fs = useRef<{ key: string; plan: unknown; settling: boolean }>({ key: "", plan: null, settling: true });
  const ov = useRef({ v: 0, tx: 0, ty: 0, tz: 0, slabs: null as Slab[] | null }).current; // the sight line toward the camera, and which walls it was tested against
  const cutaway = useStore((s) => s.cutaway);
  const { activeId, visible } = useLevelVisibility();
  const slabs = useRef<Slab[]>([]);
  slabs.current = useMemo(() => wallSlabs(plan, cutaway, activeId, visible), [plan, cutaway, activeId, visible]);
  const list = useRef<Entry[]>([]);
  const anchors = useRef<Anchor[]>([]);

  useFrame((state, dt) => {
    const layer = layerRef.current;
    if (!layer) return;
    const t0 = performance.now();
    const cam = state.camera;
    cam.updateMatrixWorld(); // the controls moved it earlier this frame; markers follow the same camera the canvas draws
    const W = state.size.width;
    const H = state.size.height;
    const { plan: pl, focusRoom } = useStore.getState();
    const zoom = "zoom" in cam && typeof cam.zoom === "number" ? cam.zoom : 1; // the rig is orthographic: zoom = pixels per metre
    if (zoom >= ZOOM_IN) zoomedIn.current = true;
    else if (zoom < ZOOM_OUT) zoomedIn.current = false;
    const isTouch = touch.current;
    const declutter = useDeclutter.getState().on;
    const f = fs.current;
    const gkey = `${W}|${H}|${declutter}|${isTouch}|${ui.expanded}|${ui.open}|${focusRoom}|${zoomedIn.current}`;
    trackSight(ov, cam, slabs.current);
    // nothing below changes unless a label moved, resized or changed class, the view changed, or a slide is still settling: an idle scene costs the projection only
    let dirty = gkey !== f.key || pl !== f.plan || f.settling;
    f.key = gkey;
    f.plan = pl;
    const minPx = isTouch ? TOUCH_PX : 0;
    const dotPx = isTouch ? TOUCH_PX : DOT_PX;

    const items = list.current;
    const anch = anchors.current;
    items.length = anch.length = 0;
    const zone = isolationOf(useStore.getState()); // the same for every marker this frame
    dirty = gatherAnchors({ cam, W, H, plan: pl, focusRoom, declutter, zoomedIn: zoomedIn.current, minPx, dotPx, zone, ov, slabs: slabs.current, items, anch }) || dirty;

    let engineMs = 0;
    if (dirty) {
      const te = performance.now();
      const res = engine.update(anch, { on: declutter, expanded: ui.expanded, minTarget: isTouch ? TOUCH_PX : 32, bounds: { w: W, h: H } });
      engineMs = performance.now() - te;
      f.settling = showLayout(layer, items, anch, res, reduced ? 1 : 1 - Math.exp(-dt * SMOOTH));
    }

    if (process.env.NODE_ENV !== "production") record(performance.now() - t0, entries.size, zoom, dirty, engineMs);
  });

  return null;
}


