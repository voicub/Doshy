"use client";
import { PauseIcon, PlayIcon, SkipForwardIcon, SpeakerHighIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { byline, headline, isPlaying, leadPlayer, listPlayers, positionAt } from "@/lib/media";
import { useStore } from "@/lib/store";
import { Art, Volume } from "./MediaBits";
import { PROGRESS_TICK_MS, mediaCall, useMediaUi } from "./mediaUi";
import { useNow } from "../useNow";
import "./media.css";

/** Slim now-playing bar above the dock. Shown only while something is playing or paused and the panel is closed. */
export default function MiniPlayer() {
  const open = useMediaUi((s) => s.open);
  const error = useMediaUi((s) => s.error);
  const states = useStore((s) => s.states);
  const p = useMemo(() => leadPlayer(listPlayers(states)), [states]);
  const now = useNow(PROGRESS_TICK_MS, !!p && isPlaying(p));
  const [vol, setVol] = useState(false);
  useEffect(() => setVol(false), [p?.id, open]);
  if (!p || open) return null;
  const playing = isPlaying(p);
  const f = p.features;
  const canToggle = playing ? f.pause : f.play;
  const pos = { media_position: positionAt(p, now), media_position_updated_at: new Date().toISOString() };
  const frac = p.duration > 0 ? Math.min(1, positionAt(p, now) / p.duration) : 0;
  return (
    <div className="mini hud brackets" role="region" aria-label="Now playing">
      <button className="mini-main" onClick={() => useMediaUi.getState().show(p.id)} aria-label={`Open media panel for ${p.name}`}>
        <Art p={p} size={36} />
        <span className="mini-text">
          <span className="mini-title">{headline(p) ?? p.name}</span>
          <span className="mini-by">{[byline(p), p.name].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
      {canToggle && (
        <button className="mp-btn small" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"} onClick={() => void mediaCall(p.id, playing ? "media_pause" : "media_play", undefined, { state: playing ? "paused" : "playing", attrs: pos })}>
          {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
      )}
      {f.next && <button className="mp-btn small" aria-label="Next" title="Next" onClick={() => void mediaCall(p.id, "media_next_track")}><SkipForwardIcon size={18} /></button>}
      {(f.volumeSet || f.volumeStep || f.mute) && (
        <button className="mp-btn small" aria-label="Volume" title="Volume" aria-expanded={vol} onClick={() => setVol((v) => !v)}><SpeakerHighIcon size={18} /></button>
      )}
      {vol && <div className="mini-pop hud"><Volume p={p} /></div>}
      {error && <span className="mini-err" role="alert">{error}</span>}
      {p.duration > 0 && <i className="mini-prog" style={{ width: `${frac * 100}%` }} />}
    </div>
  );
}
