import type { RootState } from "@react-three/fiber";
import { Raycaster, Vector2, type Object3D } from "three";
import { CATALOG } from "@/lib/catalog";
import { onGuestPage } from "@/lib/guestMode";
import { TOGGLEABLE, domainOf } from "@/lib/ha";
import { levelIdOf } from "@/lib/levels";
import { useStore } from "@/lib/store";
import type { WalkAim } from "@/lib/walkStore";
import { curtainLayers, curtainRig, isWindowCurtain } from "@/lib/curtain";
import { washdataOf } from "@/lib/washdata";
import { CURTAIN_EVENT } from "../../ui/serviceActions";
import { openDevice } from "../itemGesture";

/** How far a device can be reached with the crosshair (the E key, a click while the mouse is captured) and with a finger or the mouse pointer (m). */
export const REACH_CROSSHAIR = 3.5;
export const REACH_POINTER = 9;
const ITEM = "item:";
const WALL = "wall:";

export type Aimed = { id: string; distance: number };

/** The id of the furniture piece an object belongs to (ItemMesh names its root group `item:<id>`), or undefined. A hidden storey's pieces do not count. */
function itemIdOf(o: Object3D): string | undefined {
  for (let n: Object3D | null = o; n; n = n.parent) {
    if (!n.visible) return undefined;
    if (n.name.startsWith(ITEM)) return n.name.slice(ITEM.length);
  }
  return undefined;
}

/**
 * Finds the device a ray from the camera lands on: the nearest piece with a click handler on the storey being walked, not hidden behind a wall and within reach. The 3D
 * scene's own click handling knows nothing of walls, so every tap in the walkthrough is checked here first (a lamp in the next room is not under your finger).
 */
export type Picker = { refresh: () => void; at: (x: number, y: number, reach: number) => Aimed | null };

export function createPicker(get: () => RootState, level: () => string): Picker {
  const ray = new Raycaster();
  const at = new Vector2();
  let walls: Object3D[] = [];
  return {
    /** Collect the wall groups again (the plan changed, or the scene has just been built). */
    refresh() {
      walls = [];
      get().scene.traverse((o) => void (o.name.startsWith(WALL) && walls.push(o)));
    },
    /** `x`, `y` in -1..1 screen space (0, 0 is the middle). */
    at(x: number, y: number, reach: number): Aimed | null {
      const { camera, internal } = get();
      ray.far = reach;
      ray.setFromCamera(at.set(x, y), camera);
      const plan = useStore.getState().plan;
      const here = level();
      for (const h of ray.intersectObjects(internal.interaction, true)) {
        const id = itemIdOf(h.object);
        const item = id === undefined ? undefined : plan.items.find((i) => i.id === id);
        if (!id || !item || levelIdOf(plan, item) !== here) continue;
        const wall = ray.intersectObjects(walls, true)[0];
        return wall && wall.distance < h.distance ? null : { id, distance: h.distance };
      }
      return null;
    },
  };
}

type Use = "toggle" | "curtain" | "card" | "none";

/** What a tap on this piece does in the isometric view (components/scene/itemPointer.ts): a window curtain with a cover opens its curtain card, a camera or a washer its card, a toggleable device switches, and anything else linked has its card opened by a long press (here: by the tap). A guest's link carries no devices: nothing. */
function usageOf(itemId: string): { use: Use; entity?: string } {
  const s = useStore.getState();
  const item = s.plan.items.find((i) => i.id === itemId);
  const def = item && CATALOG[item.kind];
  if (!item || !def || onGuestPage()) return { use: "none" };
  const layers = curtainLayers(item);
  const cover = (e?: string) => !!e && domainOf(e) === "cover";
  const rig = isWindowCurtain(item.kind, def.cat) ? curtainRig(def.parts) : null;
  if (rig && ((rig.sheer && cover(item.entity)) || (rig.blackout && cover(layers.blackout.entity)))) return { use: "curtain" };
  if (!item.entity) return { use: "none" };
  const domain = domainOf(item.entity);
  if (domain === "camera" || washdataOf(s.states, item.entity)) return { use: "card", entity: item.entity };
  return { use: TOGGLEABLE.includes(domain) ? "toggle" : "card", entity: item.entity };
}

/** What to say about a piece: its name, its state and what a tap does. */
export function describe(itemId: string): WalkAim | null {
  const s = useStore.getState();
  const item = s.plan.items.find((i) => i.id === itemId);
  const def = item && CATALOG[item.kind];
  if (!item || !def) return null;
  const st = item.entity ? s.states[item.entity] : undefined;
  const name = st?.attributes.friendly_name ?? def.label;
  const { use } = usageOf(itemId);
  return { name, state: use === "none" ? "" : (st?.state.replace(/_/g, " ") ?? ""), action: use === "toggle" ? "switch" : use === "none" ? "none" : "open" };
}

/** Do what a tap on the piece does in the isometric view, through the same store action or card event (so the safety rules are the same: nothing is written on a guest page or while a history replay is showing). Returns false when there is nothing to do. */
export function actOn(itemId: string, x: number, y: number): boolean {
  const { use, entity } = usageOf(itemId);
  if (use === "toggle" && entity) void useStore.getState().toggle(entity);
  else if (use === "curtain") window.dispatchEvent(new CustomEvent(CURTAIN_EVENT, { detail: { itemId, x, y } }));
  else if (use === "card" && entity) openDevice(entity, x, y);
  return use !== "none";
}
