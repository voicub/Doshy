import { guestEnterPin, guestSessionStatus, withDb } from "@/lib/server/guestHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** Does this link ask for a PIN, and is this browser already in? */
export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  return withDb(req, (env) => guestSessionStatus(req, token, env));
}

/** `{ pin }`: the right one sets the session cookie; wrong ones are counted and eventually locked out. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  return withDb(req, (env) => guestEnterPin(req, token, env));
}
