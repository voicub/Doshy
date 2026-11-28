// Next's request gate (it runs before any page or route). Two jobs, both for guest links (docs/sharing.md); what to do is decided by lib/guestOnly.ts (gateFor, tested):
//  1. DOSHY_GUEST_ONLY=1: answer 404 to everything but the guest page, the guest API, Next's files and the icons, so a public-facing copy of Doshy has no owner screen,
//     no /api/db and no /api/ha to find.
//  2. Every guest page and guest API answer says "do not index" and "do not store", and sends no Referer, whichever mode runs.
// Everything else passes straight through; the owner's pages and routes are not touched.
import { NextResponse, type NextRequest } from "next/server";
import { gateFor } from "@/lib/guestOnly";

export function proxy(req: NextRequest) {
  const gate = gateFor(req.nextUrl.pathname, process.env.DOSHY_GUEST_ONLY === "1");
  if (gate === "block") return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const res = NextResponse.next();
  if (gate === "guest") {
    res.headers.set("x-robots-tag", "noindex, nofollow");
    res.headers.set("referrer-policy", "no-referrer");
    res.headers.set("cache-control", "no-store");
  }
  return res;
}

// Next's static files are always allowed in guest-only mode and never need headers: keep the gate off them.
export const config = { matcher: ["/((?!_next/).*)"] };
