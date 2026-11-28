// "Guest only" mode (`DOSHY_GUEST_ONLY=1`): a second Doshy that faces the internet answers 404 to everything except the guest page, the guest API, Next's own static files
// and the icons. The same list is what a reverse proxy in front of an ordinary Doshy must allow (docs/sharing.md). Pure: proxy.ts (Next's request gate) calls it.

const PREFIXES = ["/view/", "/api/guest/", "/_next/"] as const;
const FILES: readonly string[] = ["/icon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png", "/favicon.ico", "/manifest.webmanifest"];
/** An encoded dot, slash or backslash, a raw backslash, a `..` or an empty segment: ways to make one path read as two different things to two different programs. */
const SNEAKY = /%2e|%2f|%5c|\\|\.\.|\/\//i;

/** May a request for this path be answered when only guests are served? `pathname` as the request carries it (not decoded). */
export function guestOnlyAllows(pathname: string): boolean {
  if (!pathname.startsWith("/") || SNEAKY.test(pathname)) return false;
  return FILES.includes(pathname) || PREFIXES.some((p) => pathname.startsWith(p) && pathname.length > p.length);
}

/** Is this a page or API of the guest feature (it gets the privacy headers in proxy.ts)? */
export const isGuestPath = (pathname: string): boolean => pathname.startsWith("/view/") || pathname.startsWith("/api/guest/");

/** What proxy.ts does with a request: answer 404 (guest-only mode, a path that is not for guests), add the privacy headers (a guest page or guest API), or let it through untouched. */
export function gateFor(pathname: string, guestOnly: boolean): "block" | "guest" | "pass" {
  if (guestOnly && !guestOnlyAllows(pathname)) return "block";
  return isGuestPath(pathname) ? "guest" : "pass";
}
