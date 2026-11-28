// What the /api/polyhaven/* routes share: the one server-wide client, the request gate (same origin, switch, rate limit) and the error reply. Routes stay thin.
import { refuse } from "@/lib/db/http";
import { errorMessage } from "@/lib/guards";
import { createPolyHaven, PhError } from "@/lib/server/polyhaven";
import { EXTERNAL_OFF_MESSAGE, externalCacheDir, externalDataEnabled } from "@/lib/server/externalData";
import { windowLimiter } from "@/lib/siteTiles";

// A grid page asks for up to 96 thumbnails at once and the browser keeps them: the cap on requests is wide. Real downloads (the API and the file host) are capped at 90 a
// minute for the whole server; preview pictures come from Poly Haven's picture server, which is made for browsers, at up to 600 a minute (each is fetched once, then kept).
const anyRequest = windowLimiter(900, 60_000);
const upstream = windowLimiter(90, 60_000);
const thumbs = windowLimiter(600, 60_000);

export const polyHaven = createPolyHaven({ dir: externalCacheDir("polyhaven"), allow: (cdn) => (cdn ? thumbs() : upstream()), log: (m) => console.error(m) });

export const noStore = { "cache-control": "no-store" } as const;

/** The refusal to answer with, or null when the request may go on. */
export function gate(req: Request): Response | null {
  const refused = refuse(req);
  if (refused) return refused;
  if (!externalDataEnabled()) return Response.json({ error: EXTERNAL_OFF_MESSAGE, code: "off" }, { status: 403, headers: noStore });
  if (!anyRequest()) return Response.json({ error: "Too many requests at once. Try again in a moment.", code: "slow_down" }, { status: 429, headers: noStore });
  return null;
}

/** A plain-sentence reply for whatever went wrong; only `PhError` text reaches the browser. */
export function failure(e: unknown): Response {
  if (e instanceof PhError) return Response.json({ error: e.message, code: e.status === 503 ? "offline" : "failed" }, { status: e.status, headers: noStore });
  console.error("poly haven:", errorMessage(e));
  return Response.json({ error: "Something went wrong fetching from Poly Haven.", code: "failed" }, { status: 500, headers: noStore });
}
