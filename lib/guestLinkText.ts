// Words for the owner's list of guest links (Share > Share a read-only link): when a link stops working and when it was last opened. Pure, so the wording is tested.
import { agoText } from "./planLabels.ts";

type Info = { expiresAt: number | null; expired: boolean; lastUsedAt: number | null; pin: boolean; live: boolean; location: boolean };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "in 3 hours", "in 20 minutes", "in 6 days". */
function inText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `in ${plural(minutes, "minute")}`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `in ${plural(hours, "hour")}` : `in ${plural(Math.round(hours / 24), "day")}`;
}

/** One line about a link: "PIN, works for 3 more hours, last opened 5 minutes ago". */
export function linkLine(l: Info, now = Date.now()): string {
  const parts = [
    l.pin ? "PIN" : "No PIN",
    l.expiresAt === null ? "never expires" : l.expired ? "expired" : `expires ${inText(l.expiresAt - now)}`,
    l.lastUsedAt === null ? "not opened yet" : `last opened ${agoText(l.lastUsedAt, now)}`,
    ...(l.live ? ["shows live states"] : []),
    ...(l.location ? ["shows the real location"] : []),
  ];
  return parts.join(" \u00b7 ");
}

/** The address of the link: this page's own address, then /view/ and the token. */
export const guestUrl = (origin: string, token: string): string => `${origin}/view/${token}`;
