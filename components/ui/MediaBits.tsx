"use client";
import { MinusIcon, MusicNotesIcon, PlusIcon, SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { mediaImageUrl } from "@/lib/ha";
import { clock, isActive, pctToVolume, positionAt, seekTarget, volumeToPct, type Player } from "@/lib/media";
import { mediaCall } from "./mediaUi";
import "./media.css";

/** Three bars that bounce only while `playing` (and only when the user has not asked for reduced motion). */
export function Equaliser({ playing, size = 18 }: { playing: boolean; size?: number }) {
  return (
    <svg className={`eq ${playing ? "on" : ""}`} width={size} height={size} viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <rect className="eq-1" x="2" y="4" width="3.4" height="12" />
      <rect className="eq-2" x="7.3" y="4" width="3.4" height="12" />
      <rect className="eq-3" x="12.6" y="4" width="3.4" height="12" />
    </svg>
  );
}

/** Artwork through our proxy (token stays on the server); a note glyph when there is none or it fails to load. */
export function Art({ p, size }: { p: Player; size: number }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [p.picture]);
  const src = isActive(p) && p.picture && !bad ? mediaImageUrl(p.id, p.picture) : null;
  return (
    <div className="mp-art" style={{ width: size, height: size }} aria-hidden>
      {src ? <img src={src} alt="" onError={() => setBad(true)} /> : <MusicNotesIcon size={Math.round(size / 2.4)} />}
    </div>
  );
}

const KEY_SEEK_SECONDS = 10;

/** Elapsed / total with a bar. Click or drag to seek (sent once, on release) when the player can seek. */
export function Progress({ p, now }: { p: Player; now: number }) {
  const bar = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const seekable = p.features.seek && isActive(p);
  const pos = scrub ?? positionAt(p, now);
  const at = (e: PointerEvent) => {
    const r = bar.current?.getBoundingClientRect();
    return seekTarget(r && r.width > 0 ? (e.clientX - r.left) / r.width : 0, p.duration);
  };
  const seek = (s: number) => mediaCall(p.id, "media_seek", { seek_position: s }, { attrs: { media_position: s, media_position_updated_at: new Date().toISOString() } });
  const key = (e: KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? KEY_SEEK_SECONDS : e.key === "ArrowLeft" ? -KEY_SEEK_SECONDS : 0;
    if (!d) return;
    e.preventDefault();
    void seek(seekTarget((pos + d) / p.duration, p.duration));
  };
  return (
    <div className="mp-prog">
      <span className="mp-time">{clock(pos)}</span>
      <div
        ref={bar}
        className={`mp-bar ${seekable ? "seek" : ""}`}
        role={seekable ? "slider" : "progressbar"}
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={Math.round(p.duration)}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`${clock(pos)} of ${clock(p.duration)}`}
        tabIndex={seekable ? 0 : undefined}
        onKeyDown={seekable ? key : undefined}
        onPointerDown={seekable ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); setScrub(at(e)); } : undefined}
        onPointerMove={seekable ? (e) => scrub !== null && setScrub(at(e)) : undefined}
        onPointerUp={seekable ? (e) => { if (scrub === null) return; const s = at(e); setScrub(null); void seek(s); } : undefined}
        onPointerCancel={seekable ? () => setScrub(null) : undefined}
      >
        <i style={{ width: `${p.duration > 0 ? Math.min(100, (pos / p.duration) * 100) : 0}%` }} />
      </div>
      <span className="mp-time">{clock(p.duration)}</span>
    </div>
  );
}

const VOLUME_COMMIT_MS = 400;

/** Mute, then a slider (sent once on release; keyboard changes after a short pause) or step buttons, whichever the player supports. */
export function Volume({ p }: { p: Player }) {
  const [local, setLocal] = useState<number | null>(null);
  const held = useRef(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const { mute, volumeSet, volumeStep } = p.features;
  const pct = local ?? (p.volume === undefined ? 0 : volumeToPct(p.volume));
  const send = (v: number) => {
    clearTimeout(timer.current);
    setLocal(null);
    void mediaCall(p.id, "volume_set", { volume_level: pctToVolume(v) }, { attrs: { volume_level: pctToVolume(v) } });
  };
  const slider = volumeSet && p.volume !== undefined;
  if (!mute && !slider && !volumeStep) return null;
  return (
    <div className="mp-vol">
      {mute && (
        <button className="mp-btn small" aria-label={p.muted ? "Unmute" : "Mute"} aria-pressed={p.muted} title={p.muted ? "Unmute" : "Mute"} onClick={() => void mediaCall(p.id, "volume_mute", { is_volume_muted: !p.muted }, { attrs: { is_volume_muted: !p.muted } })}>
          {p.muted ? <SpeakerSlashIcon size={16} /> : <SpeakerHighIcon size={16} />}
        </button>
      )}
      {slider ? (
        <>
          <input
            type="range"
            className="rng"
            min={0}
            max={100}
            value={pct}
            aria-label="Volume"
            aria-valuetext={`${pct} percent`}
            onPointerDown={() => { held.current = true; }}
            onPointerUp={() => { held.current = false; if (local !== null) send(local); }}
            onPointerCancel={() => { held.current = false; }}
            onChange={(e) => {
              const v = Number(e.target.value);
              setLocal(v);
              clearTimeout(timer.current);
              if (!held.current) timer.current = window.setTimeout(() => send(v), VOLUME_COMMIT_MS);
            }}
          />
          <span className="mp-pct">{pct}%</span>
        </>
      ) : (
        volumeStep && (
          <>
            <button className="mp-btn small" aria-label="Volume down" title="Volume down" onClick={() => void mediaCall(p.id, "volume_down")}><MinusIcon size={16} /></button>
            <button className="mp-btn small" aria-label="Volume up" title="Volume up" onClick={() => void mediaCall(p.id, "volume_up")}><PlusIcon size={16} /></button>
          </>
        )
      )}
    </div>
  );
}
