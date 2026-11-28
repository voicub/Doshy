// Home Assistant's entity list for the guest "live states" route: the same shared one-second cache the owner's /api/ha/states uses (one fetch from Home Assistant serves
// everybody), parsed once per change. The route cuts it down to the plan's made-up ids (lib/guestPlan.ts); nothing else of it is ever sent to a guest.
// Which home it asks is decided by the plan the link belongs to (lib/db/connections.ts `homeOfPlan`), never by anything the guest sends.
import type { DatabaseSync } from "node:sqlite";
import { haFor, resolveHaIn } from "../haServer.ts";
import { statesSnapshot } from "./haStates.ts";

const parsed = new Map<string, { etag: string; list: readonly unknown[] }>();

/** The entity list of the home `connectionId` names (null: the main home), for a guest link whose plan shows it. Throws when that home cannot be asked. */
export async function loadSharedStates(db: DatabaseSync, connectionId: string | null): Promise<readonly unknown[]> {
  const home = resolveHaIn(db, connectionId);
  const { body, etag } = await statesSnapshot(home.id, async () => {
    const res = await haFor(home)("states");
    if (!res.ok) throw new Error(`Home Assistant HTTP ${res.status}`);
    return res.json();
  });
  if (parsed.get(home.id)?.etag !== etag) {
    const list: unknown = JSON.parse(body);
    parsed.set(home.id, { etag, list: Array.isArray(list) ? list : [] });
  }
  return parsed.get(home.id)?.list ?? [];
}
