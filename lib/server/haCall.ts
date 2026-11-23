// The one way the server calls a Home Assistant service: the body is checked against the allowlist in lib/haService.ts (and bounded by the entity's own
// limits) before anything leaves. The route POST /api/ha/service and the dawn automation both go through here. `fetchHa` is `ha` from lib/haServer.ts
// in production and a fake in tests, so a test can never reach a real Home Assistant.
import { errorMessage } from "../guards.ts";
import { ENTITY_ID, needsAttrs, validateService, type ServiceAttrs } from "../haService.ts";
import { ttlCache, type TtlCache } from "./ttlCache.ts";

export type HaFetch = (path: string, init?: RequestInit) => Promise<Response>;
type CallResult = { ok: true } | { ok: false; status: number; error: string };

// A slider drag sends a call every few tenths of a second, each needing the same limits: asking Home Assistant once per few seconds is enough.
// Kept per fetch function, so a test's fake Home Assistant never shares answers with another.
const ATTRS_TTL_MS = 5000;
const attrCaches = new WeakMap<HaFetch, TtlCache<ServiceAttrs>>();

/** The entity's attributes, for limits (min/max, offered modes) the validator enforces. Empty when HA has none to give. */
function attributesOf(fetchHa: HaFetch, entityId: string): Promise<ServiceAttrs> {
  let cache = attrCaches.get(fetchHa);
  if (!cache) attrCaches.set(fetchHa, (cache = ttlCache<ServiceAttrs>(ATTRS_TTL_MS, 32)));
  return cache.get(entityId, async () => {
    const res = await fetchHa(`states/${entityId}`);
    if (!res.ok) return {};
    const st: unknown = await res.json();
    if (st && typeof st === "object" && "attributes" in st && st.attributes && typeof st.attributes === "object") return { ...st.attributes };
    return {};
  });
}

/** Validate `body` (`{ domain, service, entity_id, data? }`) and call the service. 400 when refused, 502 when Home Assistant cannot be reached or says no. */
export async function callHaService(body: unknown, fetchHa: HaFetch): Promise<CallResult> {
  try {
    let attrs: ServiceAttrs = {};
    if (body && typeof body === "object" && "domain" in body && "service" in body && "entity_id" in body) {
      const { domain, service, entity_id } = body;
      if (typeof domain === "string" && typeof service === "string" && typeof entity_id === "string" && ENTITY_ID.test(entity_id) && needsAttrs(domain, service)) {
        attrs = await attributesOf(fetchHa, entity_id);
      }
    }
    const v = validateService(body, attrs);
    if (!v.ok) return { ok: false, status: 400, error: v.error };
    const res = await fetchHa(`services/${v.domain}/${v.service}`, { method: "POST", body: JSON.stringify(v.data) });
    if (!res.ok) return { ok: false, status: 502, error: `Home Assistant HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, status: 502, error: errorMessage(e) };
  }
}
