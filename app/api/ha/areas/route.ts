import { isRecord } from "@/lib/guards";
import { haFailure, ha } from "@/lib/haServer";
import type { HaArea } from "@/lib/haAreas";
import { ttlCache } from "@/lib/server/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * HA's REST API has no area endpoint (areas live in the websocket registry), but the template API can read them:
 * `areas()` lists ids, `area_name(id)` the label and `area_entities(id)` every entity in the area, including entities
 * that inherit it from their device. The Jinja below emits one JSON array; areas with no entities yield `[]`.
 */
const TEMPLATE =
  "{% set ns = namespace(o=[]) %}" +
  "{% for a in areas() %}{% set ns.o = ns.o + [{'id': a, 'name': area_name(a), 'entities': area_entities(a)}] %}{% endfor %}" +
  "{{ ns.o | tojson }}";

type Payload = { areas: HaArea[]; entityArea: Record<string, string | null> };
// Rendering the template walks every area and entity inside Home Assistant: browsers asking together share one render.
const cache = ttlCache<Payload>(60_000, 1);

async function load(): Promise<Payload> {
  const res = await ha("template", { method: "POST", body: JSON.stringify({ template: TEMPLATE }) });
  if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status}`);
  const rows: unknown = JSON.parse(await res.text());
  const data: Payload = { areas: [], entityArea: {} };
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isRecord(row) || typeof row.id !== "string" || !Array.isArray(row.entities)) continue;
    data.areas.push({ id: row.id, name: typeof row.name === "string" ? row.name : row.id });
    for (const e of row.entities) if (typeof e === "string") data.entityArea[e] = row.id;
  }
  return data;
}

export async function GET() {
  try {
    return Response.json(await cache.get("areas", load));
  } catch (e) {
    return haFailure(e);
  }
}
