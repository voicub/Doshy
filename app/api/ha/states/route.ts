import { statesReply } from "@/lib/server/haStatesReply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The entity list of the home this request is about (see lib/server/haStatesReply.ts). */
export function GET(req: Request) {
  return statesReply(req);
}
