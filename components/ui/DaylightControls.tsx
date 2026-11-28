"use client";
import { PauseIcon, PlayIcon, ClockIcon } from "@phosphor-icons/react";
import { DAYS, SEASONS, SEASON_LABEL, clock, dayLabel, dayLightText, seasonDay, todayOf, type DayLight, type Place, type Season } from "@/lib/daylight";
import { useDaylightPreview } from "@/lib/daylightPreview";

const SEASON_NOTE: Record<Season, string> = { winter: "shortest day", equinox: "day = night", summer: "longest day" };

/** The day of the year: a slider across the year, and three presets that swap the hemisphere by themselves. */
export function DateBlock({ place }: { place: Place }) {
  const year = useDaylightPreview((s) => s.year);
  const doy = useDaylightPreview((s) => s.doy);
  const patch = useDaylightPreview((s) => s.patch);
  const label = dayLabel(year, doy);
  return (
    <section className="dl-block" aria-label="Date">
      <div className="dl-row">
        <label htmlFor="dl-date" className="label">Date</label>
        <output htmlFor="dl-date" className="dl-val">{label}</output>
      </div>
      <input id="dl-date" className="dl-range" type="range" min={1} max={DAYS} step={1} value={doy} aria-valuetext={label} onChange={(e) => patch({ doy: Number(e.target.value) })} />
      <div className="dl-seasons" role="group" aria-label="Seasons">
        {SEASONS.map((s) => {
          const day = seasonDay(year, s, place.lat);
          return (
            <button key={s} type="button" className="dl-season" aria-pressed={doy === day} onClick={() => patch({ doy: day })}>
              <span>{SEASON_LABEL[s]}</span>
              <small>{SEASON_NOTE[s]}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The time of day: a slider in 5 minute steps, sunrise and sunset for the date, "Now" and Play. */
export function TimeBlock({ light }: { light: DayLight }) {
  const hour = useDaylightPreview((s) => s.hour);
  const playing = useDaylightPreview((s) => s.playing);
  const patch = useDaylightPreview((s) => s.patch);
  const label = clock(hour);
  return (
    <section className="dl-block" aria-label="Time of day">
      <div className="dl-row">
        <label htmlFor="dl-time" className="label">Time</label>
        <output htmlFor="dl-time" className="dl-val">{label}</output>
      </div>
      <input id="dl-time" className="dl-range" type="range" min={0} max={1440} step={5} value={Math.round(hour * 60)} aria-valuetext={label} onChange={(e) => patch({ hour: Number(e.target.value) / 60, playing: false })} />
      <p className="dl-sunrise">{dayLightText(light)}</p>
      <div className="dl-two">
        <button type="button" className="btn" onClick={() => patch({ ...todayOf(new Date()), playing: false })}>
          <ClockIcon size={14} aria-hidden /> Now
        </button>
        <button type="button" className={`btn ${playing ? "primary" : ""}`} aria-pressed={playing} onClick={() => patch({ playing: !playing })}>
          {playing ? <PauseIcon size={14} aria-hidden /> : <PlayIcon size={14} aria-hidden />} {playing ? "Pause" : "Play the day"}
        </button>
      </div>
    </section>
  );
}
