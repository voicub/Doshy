import { guestResourceReply, withDb } from "@/lib/server/guestHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A 3D model file used by a custom piece of this link's plan. Nothing else in the database can be reached through here. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params;
  return withDb(req, (env) => guestResourceReply(req, token, id, env));
}
