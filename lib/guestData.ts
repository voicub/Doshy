// What the guest page reads from its link's API (app/api/guest/**), checked before it is used. Pure: lib/guestApi.ts does the fetching.
import { cleanPiece, type CustomPiece } from "./customCatalog.ts";
import { isRecord } from "./guards.ts";
import type { HAState } from "./ha.ts";
import type { Plan } from "./types.ts";

export type GuestModel = { id: string; ext: "glb" | "gltf" };

export type GuestReply = {
  name: string;
  rev: number;
  /** the owner allowed read-only live states */
  live: boolean;
  /** the owner allowed the real home location */
  location: boolean;
  environment: "studio" | "garden";
  cutaway: boolean;
  plan: Plan;
  pieces: CustomPiece[];
  models: GuestModel[];
};

const MODEL_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The answer of `GET /plan`, or null when it is not one (the page then says the link does not work). */
export function parseGuestReply(raw: unknown): GuestReply | null {
  if (!isRecord(raw) || raw.v !== 1 || typeof raw.name !== "string" || typeof raw.rev !== "number" || !isRecord(raw.plan)) return null;
  const p = raw.plan;
  if (!["walls", "openings", "rooms", "items"].every((k) => Array.isArray(p[k]))) return null;
  const models = (Array.isArray(raw.models) ? raw.models : []).flatMap((m: unknown): GuestModel[] => (isRecord(m) && typeof m.id === "string" && MODEL_ID.test(m.id) ? [{ id: m.id, ext: m.ext === "gltf" ? "gltf" : "glb" }] : []));
  return {
    name: raw.name,
    rev: raw.rev,
    live: raw.live === true,
    location: raw.location === true,
    environment: raw.environment === "garden" ? "garden" : "studio",
    cutaway: raw.cutaway !== false,
    plan: p as Plan, // this server's own answer, already cleaned by lib/guestPlan.ts; the scene normalises a plan the same way it does for the owner
    pieces: (Array.isArray(raw.pieces) ? raw.pieces : []).flatMap((x: unknown) => cleanPiece(x) ?? []),
    models,
  };
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The answer of `GET /states` as the scene's own state map (made-up ids -> state and a few attributes). Entries that are not well formed are left out. */
export function parseGuestStates(raw: unknown): Record<string, HAState> {
  const out: Record<string, HAState> = {};
  if (!isRecord(raw) || !isRecord(raw.states)) return out;
  for (const [id, s] of Object.entries(raw.states)) {
    if (!isRecord(s) || s.entity_id !== id || typeof s.state !== "string" || !isRecord(s.attributes)) continue;
    const a = s.attributes;
    const attributes: HAState["attributes"] = {};
    for (const k of ["brightness", "color_temp_kelvin", "current_temperature", "temperature", "current_humidity", "humidity", "current_position", "percentage"] as const) if (finite(a[k])) attributes[k] = a[k];
    const rgb = a.rgb_color;
    if (Array.isArray(rgb) && rgb.length === 3 && rgb.every(finite)) attributes.rgb_color = [rgb[0], rgb[1], rgb[2]];
    if (typeof a.unit_of_measurement === "string") attributes.unit_of_measurement = a.unit_of_measurement;
    if (typeof a.device_class === "string") attributes.device_class = a.device_class;
    out[id] = { entity_id: id, state: s.state, attributes };
  }
  return out;
}
