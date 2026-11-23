import { ha } from "@/lib/haServer";
import { callHaService } from "@/lib/server/haCall";
import { forgetStates } from "@/lib/server/haStates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Calls an allowlisted Home Assistant service. Arguments are validated (and bounded by the entity's own min/max) before anything leaves the server. */
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  const r = await callHaService(body, ha);
  forgetStates(); // the dashboard re-reads the states a moment later: that read must not get a copy from before the call
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status });
}
