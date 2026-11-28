import { HttpError } from "@/lib/db/errors";
import { api, reply } from "@/lib/db/http";
import { revokeLink } from "@/lib/server/guestLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Take a link away: its address stops working at once. */
export function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return api(req, { write: true }, async (db) => {
    if (!revokeLink(db, (await ctx.params).id)) throw new HttpError(404, "not_found", "That link is not here (any more).");
    return reply({ ok: true });
  });
}
