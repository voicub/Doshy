import { allowHome, HaWebSocket, haFailure, haFor, resolveHa } from "@/lib/haServer";
import { parseAgents } from "@/lib/assist";
import { wsCommand } from "@/lib/haNotify";
import { refuse } from "@/lib/db/http";
import { isRecord } from "@/lib/guards";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const denied = refuse(req);
  if (denied) return denied;
  if (process.env.DOSHY_GUEST_ONLY === "1") return Response.json({ error: "Assist is unavailable in guest mode." }, { status: 403 });
  try {
    const home = resolveHa(req);
    await allowHome(home);
    const [raw, configRes] = await Promise.all([
      wsCommand(home.baseUrl, home.token, HaWebSocket, { type: "conversation/agent/list" }, "Assist is not set up in Home Assistant."),
      haFor(home)("config"),
    ]);
    const config: unknown = configRes.ok ? await configRes.json() : null;
    const language = isRecord(config) && typeof config.language === "string" && /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/.test(config.language) ? config.language : undefined;
    return Response.json({ agents: parseAgents(raw), ...(language ? { language } : {}) }, { headers: { "cache-control": "no-store" } });
  } catch { return haFailure(new Error("Assist is not set up in Home Assistant, its agent list is unavailable, or Home Assistant refused the token.")); }
}
