import { guestPlanReply, withDb } from "@/lib/server/guestHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The plan this link shares, stripped of everything private (lib/guestPlan.ts), with the custom pieces and model files it uses. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return withDb(req, (env) => guestPlanReply(req, token, env));
}
