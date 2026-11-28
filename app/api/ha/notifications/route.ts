import { MAX_HOMES } from "@/lib/db/connections";
import { HttpError } from "@/lib/db/errors";
import { errorMessage } from "@/lib/guards";
import { HaWebSocket, allowHome, haFailure, resolveHa, type HaHome } from "@/lib/haServer";
import { readNotifications, type Notification } from "@/lib/haNotify";
import { ttlCache } from "@/lib/server/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each uncached read opens a WebSocket to Home Assistant: the cache also lets browsers asking together share one. One entry per home.
const cache = ttlCache<Notification[]>(10_000, MAX_HOMES + 1);

async function load(home: HaHome): Promise<Notification[]> {
  await allowHome(home);
  return readNotifications(home.baseUrl, home.token, HaWebSocket);
}

/** HA's persistent notifications (read-only; they are only on its WebSocket API, not in /states). Cached 10 s (`?fresh=1` skips the cache, used right after a dismiss); `{ notifications: [], error: true }` when HA cannot be asked. */
export async function GET(req: Request) {
  try {
    const home = resolveHa(req);
    return Response.json({ notifications: await cache.get(home.id, () => load(home), { fresh: new URL(req.url).searchParams.has("fresh") }) });
  } catch (e) {
    if (e instanceof HttpError) return haFailure(e);
    console.error("notifications:", errorMessage(e));
    return Response.json({ notifications: [], error: true });
  }
}
