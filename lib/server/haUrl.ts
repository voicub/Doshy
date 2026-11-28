// What may be saved as the address of an extra Home Assistant, and which hosts the server will talk to for it (docs/multi-home.md, "Threat model").
// Home Assistant is nearly always on the LAN or this machine, so private and local addresses are fine; what is refused is anything that is not a plain
// http(s) address, an address that smuggles credentials, and the link-local ranges where cloud platforms serve their instance secrets (169.254.169.254).
import { lookup } from "node:dns/promises";
import { isIP, isIPv6 } from "node:net";
import { HttpError } from "../db/errors.ts";
import { badRequest } from "../db/validate.ts";

export const MAX_URL = 300;

/** The 16-bit groups of an IPv6 address (`::` expanded, an embedded dotted IPv4 turned into two groups); null when it does not parse. */
function groups6(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%")[0]; // a zone id ("fe80::1%en0") is not part of the address
  const dotted = /^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(2).map(Number);
    if ([a, b, c, d].some((n) => n > 255)) return null;
    text = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const parts = [...head, ...Array<string>(fill).fill("0"), ...tail];
  const out = parts.map((p) => (/^[0-9a-f]{1,4}$/.test(p) ? parseInt(p, 16) : NaN));
  return out.length === 8 && out.every((n) => !Number.isNaN(n)) ? out : null;
}

/** An address Doshy never connects to for an extra home: IPv4 169.254.0.0/16 (also written as an IPv4-mapped IPv6 address), IPv6 fe80::/10 and fd00:ec2::/32 (AWS's IPv6 metadata service). */
export function isBlockedAddress(ip: string): boolean {
  if (isIPv6(ip)) {
    const g = groups6(ip);
    if (!g) return true; // an address we cannot read is not one we vouch for
    if ((g[0] & 0xffc0) === 0xfe80) return true;
    if (g[0] === 0xfd00 && g[1] === 0x0ec2) return true;
    if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) return g[6] >> 8 === 169 && (g[6] & 0xff) === 254; // ::ffff:a.b.c.d
    return false;
  }
  const o = ip.split(".").map(Number);
  return o.length === 4 && o[0] === 169 && o[1] === 254;
}

const NOT_ALLOWED = "That address is not allowed: Doshy will not connect to link-local addresses (169.254.x.x, fe80::), where cloud services keep their secrets.";

/** Check and tidy the address typed for a home: `http(s)://host[:port][/path]`, no sign-in part, no query or fragment. Returns it without a trailing slash. Throws 400 in plain words. */
export function parseHaUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw badRequest("Enter the address of Home Assistant, for example http://homeassistant.local:8123");
  const text = raw.trim();
  if (text.length > MAX_URL) throw badRequest("That address is too long.");
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    throw badRequest("That does not look like an address. Start with http:// or https://, for example http://192.168.1.20:8123");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw badRequest("The address has to start with http:// or https://");
  if (u.username || u.password) throw badRequest("Leave the user name and password out of the address: the token goes in its own box.");
  if (u.hash || u.search) throw badRequest("Leave anything after ? or # out of the address.");
  if (!u.hostname) throw badRequest("That address has no host name.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isBlockedAddress(host)) throw badRequest(NOT_ALLOWED);
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

// A host's addresses can change (and a hostile DNS can answer differently each time), so a name is looked up again now and then, not once at save time.
const VERDICT_MS = 60_000;
const MAX_VERDICTS = 64;
const verdicts = new Map<string, { at: number; blocked: boolean }>();

/**
 * Throws 400 when the host of `baseUrl` is, or resolves to, a blocked address. A name that does not resolve is let through: the connection then fails with its own plain error.
 * ponytail: the check and the connection resolve the name separately, so a DNS server that flips its answer in between can still win; the fix would be a custom connect function (a new dependency).
 */
export async function assertHostAllowed(baseUrl: string, now: () => number = Date.now): Promise<void> {
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new HttpError(400, "bad_request", NOT_ALLOWED);
    return;
  }
  const hit = verdicts.get(host);
  let blocked: boolean;
  if (hit && now() - hit.at < VERDICT_MS) blocked = hit.blocked;
  else {
    try {
      blocked = (await lookup(host, { all: true })).some((a) => isBlockedAddress(a.address));
    } catch {
      blocked = false;
    }
    if (verdicts.size >= MAX_VERDICTS) verdicts.delete(verdicts.keys().next().value as string);
    verdicts.set(host, { at: now(), blocked });
  }
  if (blocked) throw new HttpError(400, "bad_request", NOT_ALLOWED);
}
