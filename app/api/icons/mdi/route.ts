import { namesOf } from "@/lib/mdi";
import { failure, gate, ICON_CACHE, mdiIcons, noStore } from "@/lib/server/mdiService";
import { MAX_NAMES } from "@/lib/server/mdiIcons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Several icons at once: `GET /api/icons/mdi?names=lightbulb,door-open` gives `{ icons: { name: { body, width, height } } }`; a name that is not an icon is simply absent. One bad name refuses the list. */
export async function GET(req: Request) {
  const refused = gate(req);
  if (refused) return refused;
  const names = namesOf(new URL(req.url).searchParams.get("names"), MAX_NAMES);
  if (!names) return Response.json({ error: `Ask for 1 to ${MAX_NAMES} icon names like lightbulb,door-open.` }, { status: 400, headers: noStore });
  try {
    return Response.json({ icons: await mdiIcons.get(names) }, { headers: ICON_CACHE });
  } catch (e) {
    return failure(e);
  }
}
