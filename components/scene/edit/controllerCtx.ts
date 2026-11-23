import type { RootState } from "@react-three/fiber";
import type { RefObject } from "react";
import type { Group, Raycaster, Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";
import { surfaceHit } from "@/lib/editMath";
import { gizmoAt } from "@/lib/gizmoPick";
import { elevationOf, groundable, outsideRooms } from "@/lib/levels";
import { minPartWidth, minProxySize, type Cycle } from "@/lib/pickMath";
import { behind, rankItems, type Cand, type Extra } from "@/lib/pickRank";
import { useStore } from "@/lib/store";
import type { Pt } from "@/lib/types";
import { isOrtho } from "../camera";
import { useEditUi } from "./editStore";
import { useFlowUi } from "./flowUi";
import { boxOf } from "./Outlines";
import { pickIndex } from "./pickIndex";
import { pickAll, aim } from "./pick";
import { isCoarse } from "./pointerKind";
import { activeLv } from "./place";

export const st = useStore.getState;
export const ui = useEditUi.getState;

export type Mods = { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean };
export type Client = { clientX: number; clientY: number };
export type Base = { id: string; sx: number; sy: number; started: boolean; changed: boolean; pointer: number };
export type Active =
  | (Base & { mode: "move"; off: Pt; lift: number })
  | (Base & { mode: "rotate"; center: Pt; startRot: number; startAngle: number })
  | (Base & { mode: "elev"; center: Pt; normal: Pt; startElev: number; startY: number });

/**
 * One mounted Controller: the canvas, the camera access and every piece of pointer state the gestures share.
 * Plain mutable fields (not React state): they change on every pointer event and must never re-render anything.
 */
export type Ctx = {
  readonly el: HTMLElement;
  readonly get: () => RootState;
  readonly proxies: RefObject<Group | null>;
  readonly furniture: boolean;
  readonly caster: Raycaster;
  /** The Ray the Raycaster aims in place, in the shape lib/pickRank.ts reads. */
  readonly rayObj: { o: Vector3; d: Vector3 };
  active: Active | null;
  press: { x: number; y: number; hit: Cand | null; shift: boolean; alt: boolean } | null;
  pending: PointerEvent | null;
  cycle: Cycle | null;
  /** Armed long press. */
  lp: { x: number; y: number; timer: number } | null;
  tipTimer: number;
  downAlt: boolean;
  raf: number;
  /** The latest pointer position over the canvas, handled once per frame. */
  readonly ptr: { clientX: number; clientY: number; pointerType: string; inside: boolean };
  hoverRaf: number;
  /** The press landed on the already-selected piece although another one ranks first. */
  sticky: boolean;
};

export const controls = (c: Ctx) => c.get().controls as OrbitControls | null;
export const aimAt = (c: Ctx, e: Client) => aim(c.caster, c.get().camera, c.el, e.clientX, e.clientY);
export const cursor = (c: Ctx, cur: string) => void (c.el.style.cursor = cur);
export const itemOf = (id: string) => st().plan.items.find((i) => i.id === id);
export const rel = (c: Ctx, e: Client) => {
  const r = c.el.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
const zoomOf = (c: Ctx) => {
  const cam = c.get().camera;
  return isOrtho(cam) ? cam.zoom : 0; // zoom = pixels per metre; a perspective camera pads nothing
};

/** Where the pointer lands (aim first) for something on `levelId` lifted by `lift`: on the level floor inside the building, on the ground outside a raised one. */
export const surfaceAt = (c: Ctx, levelId: string, lift: number) => {
  const plan = st().plan;
  return surfaceHit(c.rayObj.o, c.rayObj.d, elevationOf(plan, levelId), lift, groundable(plan, levelId, lift), (q) => outsideRooms(plan, levelId, q.x, q.y));
};
export const floorAt = (c: Ctx, e: Client, lift = 0) => {
  aimAt(c, e);
  return surfaceAt(c, activeLv().id, lift)?.p ?? null;
};

/** What the catalog is placing right now: a dragged kind, or the armed `add:` tool. */
export const placing = () => ui().dragKind ?? (st().tool.startsWith("add:") ? st().tool.slice(4) : null);
export const picking = (c: Ctx) => !(c.furniture ? placing() : useFlowUi.getState().on);

/** Everything under the pointer, best first (lib/pickRank.ts). Locked pieces are not under it in Furniture mode; "Pick through" drops the best one. */
export const rankAt = (c: Ctx, e: Client, raw = false): readonly Cand[] => {
  aimAt(c, e);
  const zoom = zoomOf(c);
  const extras: Extra[] = [];
  for (const p of pickAll(c.caster, c.proxies.current)) if (p.type === "room" || p.type === "opening") extras.push({ type: p.type, id: p.id, t: p.distance });
  const all = rankItems(c.rayObj, pickIndex.entries, { minSize: zoom ? minProxySize(zoom, isCoarse()) : 0, minWidth: zoom ? minPartWidth(zoom, isCoarse()) : 0, skipLocked: c.furniture && !raw }, extras);
  return c.furniture && !raw && ui().passThrough ? behind(all) : all;
};

/** The handle (ring or arrow) of the selected, unlocked piece under the aimed ray. */
export const gizmoUnderPointer = (c: Ctx) => {
  const s = st();
  if (!c.furniture || s.sel?.type !== "item" || itemOf(s.sel.id)?.locked) return null;
  const box = boxOf(s.plan, s.sel);
  return box ? gizmoAt(c.rayObj, { x: box.x, z: box.z, y1: box.y1, lv: box.lv, w: box.w, d: box.d }, zoomOf(c), isCoarse()) : null;
};
