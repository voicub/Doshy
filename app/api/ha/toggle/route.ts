import { isRecord } from "@/lib/guards";
import { haFailure, haFor, resolveHa } from "@/lib/haServer";
import { ENTITY_ID } from "@/lib/haService";
import { TOGGLEABLE, domainOf } from "@/lib/ha";
import { forgetStates } from "@/lib/server/haStates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Toggles one switchable entity (light, switch, fan ...). Body `{ entity_id }`; replies `{ ok: true }`. */
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  const entity_id = isRecord(body) ? body.entity_id : undefined;
  if (typeof entity_id !== "string" || !ENTITY_ID.test(entity_id) || !TOGGLEABLE.includes(domainOf(entity_id))) {
    return Response.json({ error: "entity not toggleable" }, { status: 400 });
  }
  try {
    const res = await haFor(resolveHa(req))("services/homeassistant/toggle", { method: "POST", body: JSON.stringify({ entity_id }) });
    forgetStates();
    if (!res.ok) return Response.json({ error: `Home Assistant HTTP ${res.status}` }, { status: 502 });
    return Response.json({ ok: true });
  } catch (e) {
    return haFailure(e);
  }
}
