import type { HAState } from "./ha.ts";

/** The entities that make up the bedroom TV: power, Android TV remote, and the Plex client (which only exists while the TV runs). */
export type TvEntities = { power?: string; remote?: string; plex?: string };

const DEAD = ["unavailable", "unknown"];
export const isDead = (st?: HAState) => !st || DEAD.includes(st.state);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !/^\d+$/.test(w) && w !== "tv");

/** Is this entity one of the TV's? Used to route the device card, palette and plan items to the Plex card. */
export function isTvEntity(states: Record<string, HAState>, id: string): boolean {
  return isTvIn(pickTv(states), states, id);
}

/** `isTvEntity` for a caller that already has the pick: pickTv scans and sorts every entity, so a loop over items must do it once, not once per item. */
export function isTvIn(tv: TvEntities, states: Record<string, HAState>, id: string): boolean {
  return id === tv.power || id === tv.remote || id === tv.plex || (id.startsWith("media_player.") && states[id]?.attributes.device_class === "tv");
}

export function pickTv(states: Record<string, HAState>): TvEntities {
  const ids = Object.keys(states);
  const players = ids.filter((i) => i.startsWith("media_player.")).sort();
  const power = players.find((i) => states[i].attributes.device_class === "tv") ?? players.find((i) => /(^|_)tv(_|\d|$)/.test(i.split(".")[1]) && !i.includes("plex"));
  const place = power ? words(power.split(".")[1]) : [];
  const near = (id: string) => place.length > 0 && words(`${id.split(".")[1]} ${states[id].attributes.friendly_name ?? ""}`).some((w) => place.includes(w));
  const remotes = ids.filter((i) => i.startsWith("remote.")).sort();
  const remote = remotes.find(near) ?? remotes[0];
  const plexes = players.filter((i) => i.split(".")[1].startsWith("plex"));
  const plex = plexes.find(near) ?? plexes[0];
  return { power, remote, plex };
}

/** Plex client while it reports; otherwise the TV itself. */
export function playbackEntity(tv: TvEntities, states: Record<string, HAState>): string | undefined {
  if (tv.plex && !isDead(states[tv.plex]) && states[tv.plex].state !== "off") return tv.plex;
  return tv.power ?? tv.plex;
}

export const tvIsOn = (tv: TvEntities, states: Record<string, HAState>) => {
  const p = tv.power ? states[tv.power] : undefined;
  if (p && !isDead(p)) return p.state !== "off";
  const r = tv.remote ? states[tv.remote] : undefined;
  return !!r && !isDead(r) && r.state === "on";
};

/** Playback position in seconds: HA reports it at `media_position_updated_at`; while playing it keeps advancing. */
export function positionAt(st: HAState | undefined, nowMs: number): number {
  const a = st?.attributes;
  if (!st || !a || typeof a.media_position !== "number") return 0;
  const at = a.media_position_updated_at ? Date.parse(a.media_position_updated_at) : NaN;
  const adv = st.state === "playing" && Number.isFinite(at) ? Math.max(0, (nowMs - at) / 1000) : 0;
  const pos = a.media_position + adv;
  return typeof a.media_duration === "number" && a.media_duration > 0 ? Math.min(pos, a.media_duration) : pos;
}

export { clock } from "./media.ts";

/** `S01 E04` for episodes, else undefined. */
export function episodeLabel(a: HAState["attributes"]): string | undefined {
  if (a.media_season == null && a.media_episode == null) return undefined;
  const two = (v: string | number | undefined) => (v == null || v === "" ? "--" : String(v).padStart(2, "0"));
  return `S${two(a.media_season)} E${two(a.media_episode)}`;
}

/** Activity `remote.turn_on` should start for Plex: one from the list that mentions plex, else the current one when it is Plex, else none (send HOME instead). */
export function plexActivity(a: HAState["attributes"] | undefined): string | undefined {
  const hit = a?.activity_list?.find((x) => /plex/i.test(x));
  if (hit) return hit;
  return a?.current_activity && /plex/i.test(a.current_activity) ? a.current_activity : undefined;
}
