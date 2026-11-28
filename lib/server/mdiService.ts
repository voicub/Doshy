// What the /api/icons/* routes share: the one server-wide client, the request gate (same origin, switch, rate limit) and the error reply. Routes stay thin.
import { refuse } from "../db/http.ts";
import { errorMessage } from "../guards.ts";
import { createMdiIcons, MdiError } from "./mdiIcons.ts";
import { EXTERNAL_OFF_MESSAGE, externalCacheDir, externalDataEnabled } from "./externalData.ts";
import { windowLimiter } from "../siteTiles.ts";

// A plan names a dozen kinds of icon and the picker asks for a grid at once, but the answers are kept: the rate of requests the browser may make is wide, and the one that
// matters is how often this SERVER calls Iconify (a public service that asks for fair use): at most 60 a minute, whatever the browsers ask.
const anyRequest = windowLimiter(300, 60_000);
const upstream = windowLimiter(60, 60_000);

export const mdiIcons = createMdiIcons({ dir: externalCacheDir("mdi"), allow: () => upstream(), log: (m) => console.error(m) });

export const noStore = { "cache-control": "no-store" } as const;

/** The refusal to answer with, or null when the request may go on. */
export function gate(req: Request, env: Readonly<Record<string, string | undefined>> = process.env): Response | null {
  if (env.DOSHY_GUEST_ONLY === "1") return Response.json({ error: "Not found" }, { status: 404, headers: noStore });
  const refused = refuse(req);
  if (refused) return refused;
  if (!externalDataEnabled(env)) return Response.json({ error: EXTERNAL_OFF_MESSAGE, code: "off" }, { status: 403, headers: noStore });
  if (!anyRequest()) return Response.json({ error: "Too many requests at once. Try again in a moment.", code: "slow_down" }, { status: 429, headers: noStore });
  return null;
}

/** A plain-sentence reply for whatever went wrong; only `MdiError` text reaches the browser. */
export function failure(e: unknown): Response {
  if (e instanceof MdiError) return Response.json({ error: e.message, code: e.status === 503 ? "offline" : "failed" }, { status: e.status, headers: noStore });
  console.error("mdi icons:", errorMessage(e));
  return Response.json({ error: "Something went wrong fetching icons.", code: "failed" }, { status: 500, headers: noStore });
}

/** Icons never change once published, and a copy in the browser's HTTP cache saves a round trip: a day. */
export const ICON_CACHE = { "cache-control": "private, max-age=86400" } as const;
