import { haFetchFor, haFailure } from "@/lib/haServer";
import { assistHandler } from "@/lib/server/haAssist";
import { forgetStates } from "@/lib/server/haStates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = assistHandler(() => Promise.reject(new Error("No Home Assistant")));
export async function POST(req: Request) {
  try {
    const result = await handle(req, haFetchFor(req));
    if (result.ok) forgetStates();
    return result;
  } catch (e) { return haFailure(e); }
}
