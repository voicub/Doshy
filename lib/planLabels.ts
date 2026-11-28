// Words for the plan list: how long ago a plan changed, what is in it, and the link that opens it. Pure, so the wording lives in one place.

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "just now", "5 minutes ago", "2 hours ago", "yesterday", "3 days ago", then the date. `now` is injectable for tests. */
export function agoText(ms: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "12 items, 4 rooms" (only the parts that are not zero; just walls when that is all there is); "Empty" for a plan with nothing in it, "" while the counts are unknown (a plan that has no drawing yet). */
export function countsText(s: { items: number; rooms: number; walls: number } | null): string {
  if (!s) return "";
  const parts = [s.items > 0 ? plural(s.items, "item") : "", s.rooms > 0 ? plural(s.rooms, "room") : ""].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return s.walls > 0 ? plural(s.walls, "wall") : "Empty";
}

/** The address that opens plan `id` on any device (a wall display bookmarks it): the page's own address with `plan=<id>`. Other parameters are kept. */
export function planLink(href: string, id: number): string {
  const url = new URL(href);
  url.hash = "";
  url.searchParams.set("plan", String(id));
  return url.toString();
}
