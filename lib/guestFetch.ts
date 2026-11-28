// A last line of defence on the guest page: the page only ever needs its own link's API and Next's static files, so any other request (an owner route a stray bit of
// code might call: /api/db, /api/ha, /api/site, ...) is refused in the browser before it is sent. The server does not rely on this: the owner routes are simply not reachable
// from a guest-only Doshy, and a guest has no authority on them anywhere else. It keeps the guest page honest, and its failures loud in the console.
import { GUEST_TOKEN } from "./guestMode.ts";

/** May the guest page (for link `token`) send a request to `url`? Same-origin paths of its own API and Next's files, and data:/blob: addresses (images and models made in the page). */
export function isAllowedGuestRequest(url: string, origin: string, token: string): boolean {
  if (!GUEST_TOKEN.test(token)) return false;
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  let u: URL;
  try {
    u = new URL(url, origin);
  } catch {
    return false;
  }
  if (u.origin !== origin || /%2e|%2f|%5c|\\|\.\./i.test(u.pathname)) return false;
  return u.pathname.startsWith(`/api/guest/${token}/`) || u.pathname.startsWith("/_next/");
}

let installed = false;

/** Wrap `window.fetch` so that only allowed requests go out. Call once, before the guest page asks for anything (a second call does nothing). */
export function installGuestFetch(token: string): void {
  if (installed) return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isAllowedGuestRequest(url, location.origin, token)) {
      console.warn("Doshy guest page: blocked a request that is not part of viewing:", url.replace(/^[a-z]+:\/\/[^/]+/i, "").split("?")[0]);
      return Promise.reject(new TypeError("Blocked: the guest page may only ask for its own link's data."));
    }
    return original(input, init);
  };
}
