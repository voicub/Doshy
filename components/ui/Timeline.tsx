"use client";
import { PauseIcon, PlayIcon, XIcon } from "@phosphor-icons/react";
import { useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { SPEEDS, useReplay } from "@/lib/replay";
import { useStore } from "@/lib/store";
import { fmtWhen } from "@/lib/timeline";
import { useVp } from "@/lib/useVp";
import MonoLabel from "./MonoLabel";
import Segmented from "./Segmented";
import TimelineTrack from "./TimelineTrack";
import useReportInset from "./useReportInset";
import "./timeline.css";

const SPAN_LABEL = { "24": "24 hours", "168": "7 days" } as const;
const SPANS = ["24", "168"] as const;
const SPEED_OPTIONS = SPEEDS.map(String);

/** Top of the scene: says controls are off while a past moment is shown, and the one button that goes back. */
function ReplayStrip() {
  const at = useReplay((s) => s.at);
  const playing = useReplay((s) => s.playing);
  const goLive = useReplay((s) => s.goLive);
  // a portal into the chrome layer: the bar itself sits inside the layer switch's slot on desktop, and the strip must stay positioned against the whole screen
  return createPortal(
    // not announced on every tick while playing: a screen reader hears it when it appears and whenever the replay is paused or moved by hand
    <div className="rp-strip hud" role="status" aria-live={playing ? "off" : "polite"}>
      <span className="rp-dot" aria-hidden />
      <span className="rp-text">Replay mode: controls are off. Showing <b>{fmtWhen(at)}</b></span>
      <button type="button" className="btn primary rp-live" onClick={goLive}>Live</button>
    </div>,
    document.querySelector(".chrome") ?? document.body,
  );
}

/** The history time bar: pick 24 hours or 7 days, drag the scrubber (or play it) and the whole house shows how it was; Live goes back. Mounted only while open. */
export default function Timeline() {
  const root = useRef<HTMLElement>(null);
  const compact = useVp().vp !== "regular";
  useReportInset(root, compact);
  const { status, error, timeline, hours, replaying, playing, speed, at } = useReplay(useShallow((s) => ({ status: s.status, error: s.error, timeline: s.timeline, hours: s.hours, replaying: s.replaying, playing: s.playing, speed: s.speed, at: s.at })));
  const { setHours, seek, goLive, play, pause, setSpeed, retry, close } = useReplay.getState();
  // the doors and windows the plan links: their openings are the ticks above the scrubber
  const contacts = useStore(useShallow((s) => [...new Set(s.plan.openings.flatMap((o) => (o.entity ? [o.entity] : [])))]));
  const togglePlay = () => (playing ? pause() : play());
  // Escape: back to live first, then closes the bar. Only while focus is inside it (the palette and other panels own their own Escape).
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    if (replaying) goLive();
    else close();
  };

  return (
    <>
      {replaying && <ReplayStrip />}
      <section ref={root} className="tl-bar hud brackets" aria-label="History replay" onKeyDown={onKeyDown}>
        <div className="tl-row tl-head">
          <MonoLabel className="tl-title">History</MonoLabel>
          <Segmented className="tl-span" label="How far back" value={String(hours) as "24" | "168"} options={SPANS} onChange={(h) => setHours(h === "24" ? 24 : 168)} format={(h) => SPAN_LABEL[h]} />
          <output className="tl-when" aria-label="Showing">{replaying ? fmtWhen(at) : "Now"}</output>
          <button type="button" className={`btn tl-live${replaying ? " primary" : ""}`} aria-pressed={!replaying} onClick={goLive}>Live</button>
          <button type="button" className="icon-btn tl-close" aria-label="Close history" onClick={close}><XIcon size={14} /></button>
        </div>
        {status === "ready" && timeline ? (
          <div className="tl-row tl-play">
            <button type="button" className="btn tl-playbtn" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay}>
              {playing ? <PauseIcon size={16} weight="fill" /> : <PlayIcon size={16} weight="fill" />}
            </button>
            <TimelineTrack tl={timeline} at={at} replaying={replaying} contacts={contacts} onSeek={seek} onPlayPause={togglePlay} />
            <Segmented className="tl-speed" label="Playback speed" value={String(speed)} options={SPEED_OPTIONS} onChange={(s) => setSpeed(SPEEDS.find((v) => String(v) === s) ?? 60)} format={(s) => `${s}x`} />
          </div>
        ) : status === "error" ? (
          <p className="tl-msg tl-error" role="alert">
            {error}
            <button type="button" className="btn" onClick={retry}>Retry</button>
          </p>
        ) : (
          <p className="tl-msg" role="status">Loading the last {hours === 24 ? "24 hours" : "7 days"}...</p>
        )}
        {status === "ready" && (
          <p className="tl-legend">
            <span><i className="tl-key event" /> a door or window opened</span>
            <span><i className="tl-key sun" /> sunrise and sunset</span>
            <span>60x is an hour a minute. The sky and the weather stay live.</span>
          </p>
        )}
      </section>
    </>
  );
}
