"use client";
import { useMemo, type KeyboardEvent } from "react";
import { useSeasonPreview } from "@/lib/seasonPreview";
import { dateOfDay, dayOfYear, gardenWords } from "@/lib/seasonYear";
import { useSky } from "@/lib/useSky";
import "./seasonPreview.css";

const MONTHS = ["Jan", "Apr", "Jul", "Oct"] as const;

/**
 * "Preview a date": drag along the year and the garden follows (trees leaf out, blossom, turn, drop their leaves, the lawn goes gold, snow falls).
 * It only looks: nothing is saved, and "Back to today" (or a reload) returns to the real date.
 */
export default function SeasonPreview({ inMenu = false }: { inMenu?: boolean }) {
  const day = useSeasonPreview((s) => s.day);
  const set = useSeasonPreview((s) => s.set);
  const sky = useSky();
  const now = useMemo(() => new Date(), []);
  const shown = day ?? dayOfYear(now);
  const label = dateOfDay(now.getFullYear(), shown, now).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  // a menu moves focus with the arrow keys: the slider keeps them for itself
  const keep = (e: KeyboardEvent) => { if (inMenu && e.key !== "Escape") e.stopPropagation(); };
  return (
    <div className="sp-prev" onKeyDown={keep}>
      <label className="sp-prev-row">
        <span className="label">Preview a date</span>
        <output className="sp-prev-date">{day === null ? `Today, ${label}` : label}</output>
        <input type="range" className="rng" min={0} max={364} step={1} value={shown} aria-valuetext={label} onChange={(e) => set(Number(e.target.value))} />
      </label>
      <div className="sp-prev-ticks" aria-hidden>
        {MONTHS.map((m) => <span key={m}>{m}</span>)}
      </div>
      <div className="sp-prev-row">
        <span className="sp-prev-words">{gardenWords(sky.year)}</span>
        <button type="button" className="btn sp-prev-back" disabled={day === null} onClick={() => set(null)}>Back to today</button>
      </div>
    </div>
  );
}
