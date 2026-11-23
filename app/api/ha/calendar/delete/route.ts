import { validateDelete } from "@/lib/calendar";
import { refuse } from "@/lib/db/http";
import { errorMessage } from "@/lib/guards";
import { HaWebSocket, haCredentials } from "@/lib/haServer";
import { wsCommand } from "@/lib/haNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 2048;

/**
 * Deletes an event from a Home Assistant calendar over HA's WebSocket API (the REST API cannot). Only from an explicit click in the panel.
 * Body `{ entity_id, uid, recurrence_id?, recurrence_range?: "THIS_AND_FUTURE" }`: no `recurrence_id` deletes the whole series.
 * Replies `{ ok: true }`; a refusal or HA failure is a plain sentence, never HA's own error text.
 */
export async function POST(req: Request) {
  const refused = refuse(req, "write");
  if (refused) return refused;
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return Response.json({ error: "Send JSON." }, { status: 415 });
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY) return Response.json({ error: "That request is too large." }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* validated below */
  }
  const v = validateDelete(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
  try {
    const { base, token } = haCredentials();
    await wsCommand(base, token, HaWebSocket, v.value, "Home Assistant could not delete the event");
    return Response.json({ ok: true });
  } catch (e) {
    console.error("calendar delete:", errorMessage(e));
    return Response.json({ error: "Home Assistant could not delete that event." }, { status: 502 });
  }
}
