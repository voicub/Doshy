"use client";
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, CaretUpIcon, HouseIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, SpeakerHighIcon, SpeakerSlashIcon, StopIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { HAState } from "@/lib/ha";
import { clock } from "@/lib/plex";
import MonoLabel from "./MonoLabel";
import { patchState, type ServiceData } from "./serviceActions";

export type RemoteKey = "DPAD_UP" | "DPAD_DOWN" | "DPAD_LEFT" | "DPAD_RIGHT" | "DPAD_CENTER" | "BACK" | "HOME" | "MENU";
type Attrs = HAState["attributes"];

/** Send one media_player command (`entity` may be missing: then nothing is sent); `after` runs when it went through. */
type MediaCommand = (entity: string | undefined, service: string, data?: ServiceData, after?: () => void) => unknown;

function Round({ label, onClick, disabled, children, className = "" }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return <button className={`pc-btn ${className}`} aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

/** Artwork (or the app name when there is none), title, series / episode, artist and player state. */
export function NowPlaying({ attrs, playState, active, plexDown, title, episode, art, artOk, onArtError }: { attrs: Attrs; playState: string | undefined; active: boolean; plexDown: boolean; title: string | undefined; episode: string | undefined; art: string | undefined; artOk: boolean; onArtError: () => void }) {
  const a = attrs;
  return (
    <div className={`pc-now ${active ? "" : "dim"}`}>
      <div className="pc-art" aria-hidden>
        {art && artOk ? <img src={art} alt="" onError={onArtError} /> : <span>{(a.app_name ?? "PLEX").slice(0, 8)}</span>}
      </div>
      <div className="pc-meta">
        <MonoLabel>{plexDown ? "TV" : "Plex"}{a.app_name && a.app_name.toLowerCase() !== "plex" ? ` / ${a.app_name}` : ""}</MonoLabel>
        <h2 className="pc-title">{title ?? (plexDown ? "Nothing playing" : "Idle")}</h2>
        {(a.media_series_title || episode) && <p className="pc-sub">{[a.media_series_title, episode].filter(Boolean).join("  ")}</p>}
        {a.media_artist && <p className="pc-sub">{a.media_artist}</p>}
        <p className="pc-state">{playState ?? "unknown"}</p>
      </div>
    </div>
  );
}

/** Playback position slider: drag or arrow keys; `onScrub` reports the position while dragging, `onCommit` where the user let go. */
export function SeekBar({ position, duration, onScrub, onCommit }: { position: number; duration: number; onScrub: (sec: number) => void; onCommit: (sec: number) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const frac = duration > 0 ? Math.min(1, position / duration) : 0;
  const at = (e: PointerEvent) => {
    const r = bar.current?.getBoundingClientRect();
    return r && duration > 0 ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * duration : 0;
  };
  return (
    <div className="pc-seek">
      <span className="t-val">{clock(position)}</span>
      <div
        ref={bar}
        className="pc-bar"
        role="slider"
        tabIndex={0}
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${clock(position)} of ${clock(duration)}`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onScrub(at(e)); }}
        onPointerMove={(e) => e.buttons === 1 && onScrub(at(e))}
        onPointerUp={(e) => onCommit(at(e))}
        onKeyDown={(e) => {
          const d = e.key === "ArrowRight" ? 10 : e.key === "ArrowLeft" ? -10 : e.key === "PageUp" ? 60 : e.key === "PageDown" ? -60 : 0;
          if (d) { e.preventDefault(); onCommit(Math.min(duration, Math.max(0, position + d))); }
        }}
      >
        <i style={{ width: `${frac * 100}%` }} />
      </div>
      <span className="t-val">{clock(duration)}</span>
    </div>
  );
}

export function TransportRow({ playId, active, playing, mp }: { playId: string | undefined; active: boolean; playing: boolean; mp: MediaCommand }) {
  return (
    <div className="pc-row">
      <Round label="Previous" onClick={() => void mp(playId, "media_previous_track")} disabled={!active}><SkipBackIcon size={16} /></Round>
      <Round label={playing ? "Pause" : "Play"} className="main" onClick={() => void mp(playId, playing ? "media_pause" : "media_play", undefined, () => playId && patchState(playId, {}, playing ? "paused" : "playing"))} disabled={!active}>
        {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
      </Round>
      <Round label="Stop" onClick={() => void mp(playId, "media_stop")} disabled={!active}><StopIcon size={16} /></Round>
      <Round label="Next" onClick={() => void mp(playId, "media_next_track")} disabled={!active}><SkipForwardIcon size={16} /></Round>
    </div>
  );
}

/** Mute button plus a volume slider, or Vol -/+ when the device reports no level. */
export function VolumeRow({ vol, target, mp }: { vol: Attrs | undefined; target: string; mp: MediaCommand }) {
  return (
    <div className="pc-vol">
      <Round label={vol?.is_volume_muted ? "Unmute" : "Mute"} onClick={() => void mp(target, "volume_mute", { is_volume_muted: !vol?.is_volume_muted }, () => patchState(target, { is_volume_muted: !vol?.is_volume_muted }))}>
        {vol?.is_volume_muted ? <SpeakerSlashIcon size={16} /> : <SpeakerHighIcon size={16} />}
      </Round>
      {typeof vol?.volume_level === "number" ? (
        <VolumeSlider value={Math.round(vol.volume_level * 100)} onCommit={(v) => void mp(target, "volume_set", { volume_level: v / 100 }, () => patchState(target, { volume_level: v / 100 }))} />
      ) : (
        <div className="pc-row">
          <button className="btn" onClick={() => void mp(target, "volume_down")}>Vol -</button>
          <button className="btn" onClick={() => void mp(target, "volume_up")}>Vol +</button>
        </div>
      )}
    </div>
  );
}

/** D-pad, Back / Home / Menu. */
export function RemoteSection({ onKey }: { onKey: (...keys: RemoteKey[]) => unknown }) {
  return (
    <div className="cl-sec">
      <MonoLabel>Remote</MonoLabel>
      <div className="pc-dpad" role="group" aria-label="Remote control">
        <Round label="Up" className="u" onClick={() => void onKey("DPAD_UP")}><CaretUpIcon size={18} /></Round>
        <Round label="Left" className="l" onClick={() => void onKey("DPAD_LEFT")}><CaretLeftIcon size={18} /></Round>
        <Round label="OK" className="c" onClick={() => void onKey("DPAD_CENTER")}>OK</Round>
        <Round label="Right" className="r" onClick={() => void onKey("DPAD_RIGHT")}><CaretRightIcon size={18} /></Round>
        <Round label="Down" className="d" onClick={() => void onKey("DPAD_DOWN")}><CaretDownIcon size={18} /></Round>
      </div>
      <div className="pc-row">
        <button className="btn" onClick={() => void onKey("BACK")}>Back</button>
        <button className="btn" onClick={() => void onKey("HOME")}><HouseIcon size={14} /> Home</button>
        <button className="btn" onClick={() => void onKey("MENU")}>Menu</button>
      </div>
    </div>
  );
}

export function SourceSection({ sources, current, onPick }: { sources: string[]; current: string | undefined; onPick: (source: string) => void }) {
  return (
    <div className="cl-sec">
      <MonoLabel>Source</MonoLabel>
      <div className="eb-chips" role="group" aria-label="Source">
        {sources.map((s) => (
          <button key={s} className="eb-chip" aria-pressed={current === s} onClick={() => onPick(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}

function VolumeSlider({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [local, setLocal] = useState<number | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = local ?? value;
  return (
    <label className="dc-row" style={{ flex: 1 }}>
      <input
        type="range"
        className="rng"
        min={0}
        max={100}
        value={shown}
        aria-label="Volume"
        aria-valuetext={`${shown} percent`}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v);
          clearTimeout(timer.current);
          timer.current = window.setTimeout(() => { onCommit(v); setLocal(null); }, 350);
        }}
      />
      <span className="t-val dc-val">{`${shown}%`}</span>
    </label>
  );
}