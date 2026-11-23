import { callService, type HAState, type ServiceCall } from "@/lib/ha";
import { errorMessage } from "@/lib/guards";
import { useStore } from "@/lib/store";

/** Event Scene3D dispatches when a linked device is clicked: `detail: { entity, x?, y? }` (x / y are client pixels). */
export const DEVICE_EVENT = "housey:device";
export type DeviceTarget = { entity: string; x?: number; y?: number };

/** Event Scene3D dispatches when a window curtain with a cover is tapped in Live mode: `detail: { itemId, x?, y? }` (client pixels). Dashboard opens the CurtainCard. */
export const CURTAIN_EVENT = "housey:curtain";
export type CurtainTarget = { itemId: string; x?: number; y?: number };

/** Read one field of an untyped event payload as `unknown`, so callers must narrow it. */
function field(detail: object, key: string): unknown {
  return Reflect.get(detail, key);
}

/** Read the target out of a `housey:device` CustomEvent (tolerates entity_id / entityId spellings). */
export function deviceTarget(e: Event): DeviceTarget | null {
  if (!(e instanceof CustomEvent) || !e.detail || typeof e.detail !== "object") return null;
  const d: object = e.detail;
  const entity = ["entity", "entity_id", "entityId"].map((k) => field(d, k)).find((v): v is string => typeof v === "string");
  if (!entity) return null;
  const x = field(d, "x");
  const y = field(d, "y");
  return { entity, x: typeof x === "number" ? x : undefined, y: typeof y === "number" ? y : undefined };
}

/** Read the target out of a `housey:curtain` CustomEvent. */
export function curtainTarget(e: Event): CurtainTarget | null {
  if (!(e instanceof CustomEvent) || !e.detail || typeof e.detail !== "object") return null;
  const d: object = e.detail;
  const itemId = field(d, "itemId");
  if (typeof itemId !== "string") return null;
  const x = field(d, "x");
  const y = field(d, "y");
  return { itemId, x: typeof x === "number" ? x : undefined, y: typeof y === "number" ? y : undefined };
}

/** The `data` payload of a Home Assistant service call. */
export type ServiceData = NonNullable<ServiceCall["data"]>;

/** Show a change right away: merge attributes (and optionally the state) into the cached entity until the next poll confirms it. */
export function patchState(entityId: string, attributes: Partial<HAState["attributes"]>, state?: string) {
  useStore.setState((s) => {
    const cur = s.states[entityId];
    if (!cur) return s;
    return { states: { ...s.states, [entityId]: { ...cur, state: state ?? cur.state, attributes: { ...cur.attributes, ...attributes } } } };
  });
}

/** Call a service; resolves to an error message (null on success) and refreshes states shortly after. Never throws. */
export async function runService(call: ServiceCall): Promise<string | null> {
  try {
    await callService(call);
    setTimeout(() => void useStore.getState().refreshStates(), 600);
    return null;
  } catch (e) {
    return errorMessage(e);
  }
}
