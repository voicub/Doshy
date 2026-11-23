import { api, reply } from "@/lib/db/http";
import { automationOff, haConfigured, isRunning, lastActions } from "@/lib/server/curtainAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the dawn rule did last, for the curtain inspector: `{ items: { [itemId]: { at, action: "close" | "open" | "skip", why } }, running, off, haConfigured }`.
 * `running` is false until the dashboard server has been restarted after the rule was installed, when HOUSEY_AUTOMATION=off, or without Home Assistant.
 */
export function GET(req: Request) {
  return api(req, {}, (db) => reply({ items: lastActions(db), running: isRunning(), off: automationOff(), haConfigured: haConfigured() }));
}
