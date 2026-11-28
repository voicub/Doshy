import { randomBytes } from "node:crypto";
import { refuse } from "@/lib/db/http";
import { isRecord } from "@/lib/guards";
import { haFailure, haFetchFor } from "@/lib/haServer";
import { tokenBucket } from "@/lib/modelLibrary";
import { createAutomation, deleteAutomation, listAutomations, setEnabled, type AutomationReply } from "@/lib/server/haAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 64 * 1024;
// Creating or deleting an automation is a deliberate click; 20 a minute is plenty and stops a stuck client from rewriting Home Assistant's config in a loop.
const take = tokenBucket(20);

const reply = (r: AutomationReply) => Response.json(r.body, { status: r.status });

/** Doshy's own automations (ids starting `doshy_`) and the notification services Home Assistant has: `{ automations, notify }`. */
export async function GET(req: Request) {
  const refused = refuse(req);
  if (refused) return refused;
  try {
    return reply(await listAutomations(haFetchFor(req)));
  } catch (e) {
    return haFailure(e);
  }
}

/**
 * `{ action: "create", confirm: true, recipe }` makes an automation from a recipe (lib/automations.ts); `{ action: "enable" | "disable" | "delete", id }` changes one of
 * Doshy's. Never takes raw automation code, and never touches an automation whose id does not start `doshy_`.
 */
export async function POST(req: Request) {
  const refused = refuse(req);
  if (refused) return refused;
  if (!take()) return Response.json({ error: "Too many changes at once. Try again in a moment." }, { status: 429 });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return Response.json({ error: "Send JSON." }, { status: 415 });
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY) return Response.json({ error: "That request is too large." }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* an unknown action below */
  }
  const action = isRecord(body) ? body.action : undefined;
  let fetchHa;
  try {
    fetchHa = haFetchFor(req);
  } catch (e) {
    return haFailure(e);
  }
  if (action === "create") return reply(await createAutomation(body, fetchHa, () => randomBytes(6).toString("hex")));
  if (action === "enable" || action === "disable") return reply(await setEnabled(isRecord(body) ? body.id : undefined, action === "enable", fetchHa));
  if (action === "delete") return reply(await deleteAutomation(isRecord(body) ? body.id : undefined, fetchHa));
  return Response.json({ error: "Unknown action." }, { status: 400 });
}
