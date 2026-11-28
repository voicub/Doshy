/**
 * `?embed=1`: Doshy inside another page (the Lovelace card `doshy-card`, or any iframe). Only the 3D scene is shown, nothing is saved.
 * Address parameters (see docs/lovelace-card.md): `embed=1`, `interactive=1` (taps toggle devices), `view=overview | room:<name>`.
 * `theme=dark|light` is accepted and ignored: the scene is dark either way.
 */

export type EmbedParams = {
  embed: boolean;
  /** taps on devices work, as in the normal 3D view; off: the scene is view-only and the page behind it keeps scrolling */
  interactive: boolean;
  /** the room to show on its own (`view=room:<name>`), or null for the whole plan */
  room: string | null;
};

const MAX_ROOM_NAME = 80;
const ROOM_PREFIX = "room:";

/** Explicit only: an iframe is not enough, the address has to say `embed=1`. */
export function parseEmbed(search: string): EmbedParams {
  const q = new URLSearchParams(search);
  const view = (q.get("view") ?? "").trim();
  const name = view.toLowerCase().startsWith(ROOM_PREFIX) ? view.slice(ROOM_PREFIX.length).trim().slice(0, MAX_ROOM_NAME) : "";
  return { embed: q.get("embed") === "1", interactive: q.get("interactive") === "1", room: name || null };
}

/** The id of the room called `name` (not case-sensitive, spaces at the ends ignored), or null. Two rooms with the same name: the first. */
export function roomIdByName(rooms: readonly { id: string; name: string }[], name: string): string | null {
  const want = name.trim().toLowerCase();
  return want ? (rooms.find((r) => r.name.trim().toLowerCase() === want)?.id ?? null) : null;
}
