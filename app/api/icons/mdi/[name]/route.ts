import { isMdiName } from "@/lib/mdi";
import { failure, gate, ICON_CACHE, mdiIcons, noStore } from "@/lib/server/mdiService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One icon: `GET /api/icons/mdi/<name>` gives `{ name, body, width, height }` (the drawing, already checked), 400 for a name that is not an icon name, 404 when there is no such icon. */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const refused = gate(req);
  if (refused) return refused;
  const { name } = await ctx.params;
  if (!isMdiName(name)) return Response.json({ error: "That is not an icon name." }, { status: 400, headers: noStore });
  try {
    const icon = (await mdiIcons.get([name]))[name];
    return icon ? Response.json({ name, ...icon }, { headers: ICON_CACHE }) : Response.json({ error: "There is no such icon." }, { status: 404, headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
