import { guestStatesReply, withDb } from "@/lib/server/guestHandlers";
import { loadSharedStates } from "@/lib/server/guestStates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only live states of the devices the plan is linked to (state words and numbers only), for a link made with "show live states". 404 for any other link. The home asked is the plan's own, never a request header. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return withDb(req, (env) => guestStatesReply(req, token, { ...env, loadStates: (connectionId) => loadSharedStates(env.db, connectionId) }));
}
