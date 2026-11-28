"use client";
import { SunHorizonIcon } from "@phosphor-icons/react";
import { useMemo, type KeyboardEvent } from "react";
import { dayMarks, eventTicks, fmtWhenLong, sunTicks, type Timeline } from "@/lib/timeline";

const MIN = 60_000;
const BIG_STEP = 10; // minutes: Shift+Arrow, PageUp / PageDown
const W = 1000; // the marks' drawing is 1000 units wide, whatever the screen

type Props = { tl: Timeline; at: number; replaying: boolean; contacts: string[]; onSeek: (t: number) => void; onPlayPause: () => void };

/** The marks above the scrubber (day starts, door / window openings, sunrise and sunset) and the scrubber itself: a native range input, one step = one minute, the end = now. */
export default function TimelineTrack({ tl, at, replaying, contacts, onSeek, onPlayPause }: Props) {
  const span = tl.to - tl.from;
  const steps = Math.max(1, Math.ceil(span / MIN));
  const pct = (t: number) => `${(((t - tl.from) / span) * 100).toFixed(2)}%`;
  const marks = useMemo(() => {
    const days = dayMarks(tl.from, tl.to);
    const line = (t: number, top: number) => `M${(((t - tl.from) / (tl.to - tl.from)) * W).toFixed(1)} ${top}V14`;
    return {
      days,
      sun: sunTicks(tl),
      dayPath: days.map((d) => line(d.t, 0)).join(""),
      eventPath: eventTicks(tl, contacts, tl.from, tl.to).map((e) => line(e.t, 4)).join(""),
    };
  }, [tl, contacts]);

  const minute = Math.min(steps, Math.max(0, (at - tl.from) / MIN));
  const seekMinute = (m: number) => onSeek(m >= steps ? tl.to : tl.from + Math.max(0, m) * MIN);

  // Arrow keys (one step) are the browser's own. Shift+Arrow and PageUp / PageDown jump ten minutes, Space plays or pauses; the page's own shortcuts (PageUp changes the level) must not also fire.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = e.key === "PageUp" || e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "PageDown" || e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onPlayPause();
    } else if (dir && (e.shiftKey || e.key.startsWith("Page"))) {
      e.preventDefault();
      e.stopPropagation();
      seekMinute(Math.round(minute) + dir * BIG_STEP);
    }
  };

  return (
    <div className="tl-track">
      <div className="tl-marks" aria-hidden>
        <svg viewBox={`0 0 ${W} 14`} preserveAspectRatio="none" focusable="false">
          <path className="tl-day" d={marks.dayPath} />
          <path className="tl-event" d={marks.eventPath} />
        </svg>
        {marks.days.map((d) => <span key={d.t} className="tl-daylbl" style={{ left: pct(d.t) }}>{d.label}</span>)}
        {marks.sun.map((s) => (
          <span key={s.t} className={`tl-sun ${s.kind}`} style={{ left: pct(s.t) }} title={s.kind === "sunrise" ? "Sunrise" : "Sunset"}>
            <SunHorizonIcon size={12} weight={s.kind === "sunrise" ? "fill" : "regular"} />
          </span>
        ))}
      </div>
      <input
        className="tl-range"
        type="range"
        min={0}
        max={steps}
        step={1}
        value={minute}
        aria-label="Time in the past (the right end is now)"
        aria-valuetext={replaying ? fmtWhenLong(at) : "Now"}
        onChange={(e) => seekMinute(Number(e.target.value))}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
