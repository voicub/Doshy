import { deleteEvent } from "@/lib/db/events";
import { HttpError } from "@/lib/db/errors";
import { api, reply } from "@/lib/db/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function DELETE(req: Request, ctx: Ctx) {
  return api(req, { write: true }, async (db) => {
    if (!deleteEvent(db, (await ctx.params).id)) throw new HttpError(404, "not_found", "That event is not here.");
    return reply({ ok: true });
  });
}
