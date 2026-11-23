import { errorMessage } from "@/lib/guards";
import { HaWebSocket, haCredentials } from "@/lib/haServer";
import { readNotifications, type Notification } from "@/lib/haNotify";
import { ttlCache } from "@/lib/server/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each uncached read opens a WebSocket to Home Assistant: the cache also lets browsers asking together share one.
const cache = ttlCache<Notification[]>(10_000, 1);

async function load(): Promise<Notification[]> {
  const { base, token } = haCredentials();
  return readNotifications(base, token, HaWebSocket);
}

/** HA's persistent notifications (read-only; they are only on its WebSocket API, not in /states). Cached 10 s (`?fresh=1` skips the cache, used right after a dismiss); `{ notifications: [], error: true }` when HA cannot be asked. */
export async function GET(req: Request) {
  try {
    return Response.json({ notifications: await cache.get("list", load, { fresh: new URL(req.url).searchParams.has("fresh") }) });
  } catch (e) {
    console.error("notifications:", errorMessage(e));
    return Response.json({ notifications: [], error: true });
  }
}
