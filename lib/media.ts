// Pure helpers for media_player entities: normalising HA state, what a player can do, playback position, volume maths, sorting and grouping by room.
import type { HAState } from "./ha.ts";
import { clamp } from "./mathUtil.ts";

/** Home Assistant's MediaPlayerEntityFeature bits. */
export const FEATURE = {
  PAUSE: 1, SEEK: 2, VOLUME_SET: 4, VOLUME_MUTE: 8, PREVIOUS_TRACK: 16, NEXT_TRACK: 32, TURN_ON: 128, TURN_OFF: 256, PLAY_MEDIA: 512,
  VOLUME_STEP: 1024, SELECT_SOURCE: 2048, STOP: 4096, CLEAR_PLAYLIST: 8192, PLAY: 16384, SHUFFLE_SET: 32768, SELECT_SOUND_MODE: 65536,
  BROWSE_MEDIA: 131072, REPEAT_SET: 262144, GROUPING: 524288,
} as const;

type Features = { pause: boolean; play: boolean; stop: boolean; seek: boolean; volumeSet: boolean; volumeStep: boolean; mute: boolean; previous: boolean; next: boolean; turnOn: boolean; turnOff: boolean; source: boolean; soundMode: boolean; shuffle: boolean; repeat: boolean; browse: boolean; grouping: boolean };

export function featuresOf(mask: unknown): Features {
  const m = typeof mask === "number" && Number.isFinite(mask) ? Math.trunc(mask) : 0;
  const has = (bit: number) => (m & bit) !== 0 && m >= 0;
  return {
    pause: has(FEATURE.PAUSE), play: has(FEATURE.PLAY), stop: has(FEATURE.STOP), seek: has(FEATURE.SEEK), volumeSet: has(FEATURE.VOLUME_SET), volumeStep: has(FEATURE.VOLUME_STEP),
    mute: has(FEATURE.VOLUME_MUTE), previous: has(FEATURE.PREVIOUS_TRACK), next: has(FEATURE.NEXT_TRACK), turnOn: has(FEATURE.TURN_ON), turnOff: has(FEATURE.TURN_OFF),
    source: has(FEATURE.SELECT_SOURCE), soundMode: has(FEATURE.SELECT_SOUND_MODE), shuffle: has(FEATURE.SHUFFLE_SET), repeat: has(FEATURE.REPEAT_SET), browse: has(FEATURE.BROWSE_MEDIA), grouping: has(FEATURE.GROUPING),
  };
}

type PlayerState = "playing" | "paused" | "buffering" | "idle" | "on" | "standby" | "off" | "unavailable";
export type Repeat = "off" | "all" | "one";

export type Player = {
  id: string;
  name: string;
  state: PlayerState;
  features: Features;
  title?: string;
  artist?: string;
  album?: string;
  series?: string;
  app?: string;
  /** server-relative artwork path as HA reports it (load through mediaImageUrl) */
  picture?: string;
  duration: number;
  position: number;
  /** epoch ms the position was measured at */
  positionAt?: number;
  /** 0..1 */
  volume?: number;
  muted: boolean;
  source?: string;
  sources: string[];
  soundMode?: string;
  soundModes: string[];
  shuffle?: boolean;
  repeat?: Repeat;
  group: string[];
};

const STATES: PlayerState[] = ["playing", "paused", "buffering", "idle", "on", "standby", "off"];
const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const secs = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

export function normalise(st: HAState): Player {
  const a = st.attributes;
  const at = typeof a.media_position_updated_at === "string" ? Date.parse(a.media_position_updated_at) : NaN;
  const repeat = a.repeat === "off" || a.repeat === "all" || a.repeat === "one" ? a.repeat : undefined;
  return {
    id: st.entity_id,
    name: str(a.friendly_name) ?? st.entity_id.split(".")[1].replace(/_/g, " "),
    state: STATES.find((s) => s === st.state) ?? "unavailable",
    features: featuresOf(a.supported_features),
    title: str(a.media_title),
    artist: str(a.media_artist),
    album: str(a.media_album_name),
    series: str(a.media_series_title),
    app: str(a.app_name),
    picture: str(a.entity_picture),
    duration: secs(a.media_duration),
    position: secs(a.media_position),
    positionAt: Number.isFinite(at) ? at : undefined,
    volume: typeof a.volume_level === "number" && Number.isFinite(a.volume_level) ? clamp(a.volume_level, 0, 1) : undefined,
    muted: a.is_volume_muted === true,
    source: str(a.source),
    sources: strs(a.source_list),
    soundMode: str(a.sound_mode),
    soundModes: strs(a.sound_mode_list),
    shuffle: typeof a.shuffle === "boolean" ? a.shuffle : undefined,
    repeat,
    group: strs(a.group_members),
  };
}

/** Something is loaded: playing, paused or buffering. */
export const isActive = (p: Player) => p.state === "playing" || p.state === "paused" || p.state === "buffering";
export const isPlaying = (p: Player) => p.state === "playing" || p.state === "buffering";
export const isDead = (p: Player) => p.state === "unavailable";

/** Playback position in seconds: advances only while playing, never past the duration (when known), never negative. */
export function positionAt(p: Pick<Player, "state" | "position" | "positionAt" | "duration">, nowMs: number): number {
  const adv = p.state === "playing" && p.positionAt !== undefined ? Math.max(0, (nowMs - p.positionAt) / 1000) : 0;
  const pos = Math.max(0, p.position + adv);
  return p.duration > 0 ? Math.min(pos, p.duration) : pos;
}

/** A seek target in seconds from a 0..1 fraction of the bar, rounded to whole seconds and clamped to the track. */
export const seekTarget = (frac: number, duration: number) => Math.round(clamp(Number.isFinite(frac) ? frac : 0, 0, 1) * Math.max(0, duration));

export const volumeToPct = (v: number) => Math.round(clamp(v, 0, 1) * 100);
/** Slider percent (0..100) to HA's 0..1, two decimals. */
export const pctToVolume = (pct: number) => Math.round(clamp(Number.isFinite(pct) ? pct : 0, 0, 100)) / 100;

/** What to call the thing playing: title, else the app or source running. */
export const headline = (p: Player) => p.title ?? (isActive(p) ? p.app ?? p.source : undefined);
/** Second line: artist (with album), else series, else app. */
export const byline = (p: Player) => [p.artist ?? p.series ?? p.app, p.artist ? p.album : undefined].filter(Boolean).join(" · ") || undefined;

const RANK: Record<PlayerState, number> = { playing: 0, buffering: 0, paused: 1, on: 2, idle: 3, standby: 4, off: 5, unavailable: 6 };

/** Playing first, then paused, then the rest; by name inside each band. Returns a new array. */
export function sortPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) => RANK[a.state] - RANK[b.state] || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

type RoomGroup = { area: string | null; name: string; players: Player[] };

/** Players grouped by Home Assistant area: rooms with something playing first, then by area name (players keep their input order); players without an area go last under `elsewhere`. */
export function groupByRoom(players: Player[], areas: { id: string; name: string }[], entityArea: Record<string, string | null>, elsewhere = "Elsewhere"): RoomGroup[] {
  const by = new Map<string | null, Player[]>();
  for (const p of players) {
    const a = entityArea[p.id] ?? null;
    const key = a !== null && areas.some((x) => x.id === a) ? a : null;
    by.set(key, [...(by.get(key) ?? []), p]);
  }
  const best = (ps: Player[]) => Math.min(...ps.map((p) => RANK[p.state]));
  const named = areas
    .flatMap((a) => {
      const ps = by.get(a.id);
      return ps ? [{ area: a.id, name: a.name, players: ps }] : [];
    })
    .sort((x, y) => best(x.players) - best(y.players) || x.name.localeCompare(y.name));
  const elsewherePlayers = by.get(null);
  return elsewherePlayers ? [...named, { area: null, name: elsewhere, players: elsewherePlayers }] : named;
}

/** Every media_player in the state map, normalised. */
export const listPlayers = (states: Record<string, HAState>): Player[] => Object.values(states).filter((s) => s.entity_id.startsWith("media_player.")).map(normalise);

/** The player the mini bar and panel lead with: the first playing one, else the first paused one. */
export const leadPlayer = (players: Player[]): Player | undefined => sortPlayers(players.filter(isActive))[0];

export const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};
