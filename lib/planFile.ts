import type { Dashboard } from "./dbApi.ts";
import { isRecord } from "./guards.ts";
import { COLOR_RE, ICON_RE, MAX_DESCRIPTION, MAX_NAME } from "./planIdentity.ts";
import type { Plan } from "./types.ts";
import { withMdiIcons } from "./mdiPlan.ts";

/** Longest home name (lib/db/connections.ts `MAX_HOME_NAME`; the file reader cannot import the server module). */
const MAX_HOME_NAME = 40;

/**
 * A plan file (`doshy-plan.json`): the plan itself, plus optionally the custom pieces and 3D models it uses (`custom`) and the plan's identity
 * (`dashboard`: name, icon, colour, description), so a plan imported as a NEW plan arrives looking like the one that was exported. Pure: no I/O.
 * `home` is the NAME of the Home Assistant the plan showed (only when it was not the main home): never an address or a token, so a file can be shared safely.
 * On import it links the new plan to a home of the same name, if this Doshy has one, and otherwise is ignored.
 */
export type PlanIdentity = { name: string; icon: string; color: string; description: string; home?: string };

export const identityOf = (d: Pick<Dashboard, "name" | "icon" | "color" | "description">, home?: string): PlanIdentity => ({ name: d.name, icon: d.icon, color: d.color, description: d.description, ...(home ? { home } : {}) });

/** The `dashboard` block of a plan file, made safe: a name is required, an icon or colour that does not fit the rules is dropped. Null when there is no usable block. */
export function parsePlanIdentity(v: unknown): PlanIdentity | null {
  if (!isRecord(v) || typeof v.name !== "string") return null;
  const name = v.name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();
  if (!name) return null;
  const home = typeof v.home === "string" ? v.home.replace(/\s+/g, " ").trim().slice(0, MAX_HOME_NAME) : "";
  return {
    name,
    icon: typeof v.icon === "string" && ICON_RE.test(v.icon) ? v.icon : "",
    color: typeof v.color === "string" && COLOR_RE.test(v.color) ? v.color.toLowerCase() : "",
    description: typeof v.description === "string" ? v.description.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION) : "",
    ...(home ? { home } : {}),
  };
}

export type PlanFileParts = {
  plan: Plan;
  custom: unknown;
  identity: PlanIdentity | null;
  /** The floor plan image block, unchecked (lib/planTraceFile.ts `readTraceImage` checks it); only present when the file has one. */
  traceImage?: unknown;
  /** The floor photo textures block, unchecked (lib/planFloorPhotoFile.ts `readFloorPhotos` checks it); only present when the file has one. */
  floorPhotos?: unknown;
  /** The Poly Haven textures block, unchecked (lib/planMaterialsFile.ts `readMaterials` checks it); only present when the file has one. */
  materials?: unknown;
};

/** Take a parsed plan file apart. The plan comes back WITHOUT the `custom`, `dashboard`, `traceImage`, `floorPhotos` and `materials` blocks (they are not part of a plan). Throws when it is not a plan. */
export function splitPlanFile(raw: unknown): PlanFileParts {
  if (!isRecord(raw)) throw new Error("missing keys");
  const { custom, dashboard, traceImage, floorPhotos, materials, ...p } = raw;
  if (!p.walls || !p.openings || !p.rooms || !p.items) throw new Error("missing keys");
  const parts: PlanFileParts = { plan: withMdiIcons(p as unknown as Plan), custom, identity: parsePlanIdentity(dashboard) }; // the four lists are there; the rest is checked by the store when it loads the plan
  return { ...parts, ...(traceImage === undefined ? {} : { traceImage }), ...(floorPhotos === undefined ? {} : { floorPhotos }), ...(materials === undefined ? {} : { materials }) };
}
