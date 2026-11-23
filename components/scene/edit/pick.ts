import { Raycaster, Vector2, type Camera, type Group } from "three";
import { isRecord } from "@/lib/guards";
import type { SelType } from "@/lib/types";

/** What a pick box stands for: carried in the proxy mesh's userData. */
export type Pick = { type: SelType; id: string };

const SEL_TYPES: readonly SelType[] = ["wall", "opening", "room", "item", "void", "ground", "path"];

/** The pick a proxy mesh carries in its userData (null for a mesh that carries none). */
export function readPick(userData: unknown): Pick | null {
  if (!isRecord(userData) || typeof userData.id !== "string") return null;
  const type = SEL_TYPES.find((t) => t === userData.type);
  return type ? { type, id: userData.id } : null;
}

const ndc = new Vector2();

/** Aim `ray` through a client-space pointer position. */
export function aim(ray: Raycaster, camera: Camera, dom: HTMLElement, clientX: number, clientY: number) {
  const r = dom.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray;
}

/** Every distinct pick target under the aimed ray, nearest to the camera first (one entry per userData id: its nearest hit). */
export function pickAll(ray: Raycaster, group: Group | null): (Pick & { distance: number })[] {
  if (!group) return [];
  group.updateWorldMatrix(true, true);
  const seen = new Set<string>();
  const out: (Pick & { distance: number })[] = [];
  for (const hit of ray.intersectObjects(group.children, false)) {
    const d = readPick(hit.object.userData);
    if (!d) continue;
    const key = `${d.type}:${d.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...d, distance: hit.distance });
  }
  return out;
}
