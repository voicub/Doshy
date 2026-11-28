"use client";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { MONTH_NAMES, dateOfDay, dayLabel, dayLight, localOffsetMinutes, offsetLabel, sunAt, sunWords, type Place } from "@/lib/daylight";
import { useDaylightPreview } from "@/lib/daylightPreview";
import { legendMax, litCells, rampColor, sunSummary } from "@/lib/daylightRun";
import { siteCenter, validLatLon } from "@/lib/geo";
import { findLevel, levelIdOf, sortedLevels } from "@/lib/levels";
import { siteOf } from "@/lib/siteTypes";
import { activeLevelId, useStore } from "@/lib/store";
import type { Plan, Room } from "@/lib/types";
import { DateBlock, TimeBlock } from "./DaylightControls";
import DaylightSunPath from "./DaylightSunPath";
import HudPanel from "./HudPanel";
import { useDayResult } from "./useDayResult";
import "./daylight.css";

const TICK_MS = 100;
const TICK_HOURS = 0.2; // a whole day in 120 ticks: 12 seconds

/** Rooms worth analysing: whole rooms (not alcoves or door thresholds), on the level being edited in the plan view, on every level in Live. */
function roomsOf(plan: Plan, level: string | null): Room[] {
  return plan.rooms.filter((r) => !r.parent && Math.min(r.w, r.h) >= 0.5 && (!level || levelIdOf(plan, r) === level));
}

/** The room to analyse unless the owner picked another: the selected room (or the one an alcove belongs to), else the focused one, else the first. */
function defaultRoom(plan: Plan, rooms: Room[], selected: string | null, focus: string | null): Room | undefined {
  const host = (id: string | null) => {
    const r = plan.rooms.find((x) => x.id === id);
    return r && rooms.find((x) => x.id === (r.parent ?? r.id));
  };
  return host(selected) ?? host(focus) ?? rooms[0];
}

function useRoom(plan: Plan): { rooms: Room[]; room: Room | undefined; pick: (id: string) => void } {
  const level = useStore((s) => (s.view === "plan" ? activeLevelId(s) : null));
  const selected = useStore((s) => (s.sel?.type === "room" ? s.sel.id : null));
  const focus = useStore((s) => s.focusRoom);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [selected, focus]); // clicking another room in the scene follows it
  const rooms = useMemo(() => roomsOf(plan, level), [plan, level]);
  const room = rooms.find((r) => r.id === picked) ?? defaultRoom(plan, rooms, selected, focus);
  return { rooms, room, pick: setPicked };
}

/** Where the home is: the plan's Surroundings location (its own coordinates, else Home Assistant's home), else the coordinates typed in the panel. */
function usePlace(): { place: Place; known: boolean } {
  const rawSite = useStore((s) => s.plan.site);
  const homeLat = useStore((s) => s.states["zone.home"]?.attributes?.latitude); // the two numbers, not the whole states object: it is replaced on every poll
  const homeLon = useStore((s) => s.states["zone.home"]?.attributes?.longitude);
  const typed = useDaylightPreview((s) => s.place);
  const found = useMemo(() => siteCenter(siteOf(rawSite), { "zone.home": { attributes: { latitude: homeLat, longitude: homeLon } } }), [rawSite, homeLat, homeLon]);
  const lat = found?.lat ?? typed.lat;
  const lon = found?.lon ?? typed.lon;
  const place = useMemo(() => ({ lat, lon }), [lat, lon]); // one object while the numbers stand, so nothing downstream recomputes on a poll
  return { place, known: !!found };
}

const coord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;

/** Two number fields for a home with no known location; only a valid pair is applied. */
function PlaceFields({ place }: { place: Place }) {
  const patch = useDaylightPreview((s) => s.patch);
  const [text, setText] = useState({ lat: String(place.lat), lon: String(place.lon) });
  const pair = (t: { lat: string; lon: string }) => (t.lat.trim() === "" || t.lon.trim() === "" ? null : validLatLon(Number(t.lat), Number(t.lon)));
  const edit = (k: "lat" | "lon", v: string) => {
    const next = { ...text, [k]: v };
    setText(next);
    const ok = pair(next);
    if (ok) patch({ place: ok });
  };
  const bad = !pair(text);
  return (
    <div className="dl-place">
      <label className="field">
        <span className="label">Latitude (north +)</span>
        <input type="number" inputMode="decimal" step="0.01" value={text.lat} aria-invalid={bad} onChange={(e) => edit("lat", e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Longitude (east +)</span>
        <input type="number" inputMode="decimal" step="0.01" value={text.lon} aria-invalid={bad} onChange={(e) => edit("lon", e.target.value)} />
      </label>
      {bad && <p className="field-note warn dl-wide">Latitude goes from -90 to 90 and longitude from -180 to 180.</p>}
    </div>
  );
}

/** "Show sun hours on the floor" with its two pictures, and the scale that explains the colours. */
function FloorBlock({ maxHours, hasResult }: { maxHours: number; hasResult: boolean }) {
  const heat = useDaylightPreview((s) => s.heat);
  const mode = useDaylightPreview((s) => s.mode);
  const patch = useDaylightPreview((s) => s.patch);
  const top = legendMax(maxHours);
  const ramp = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => `rgb(${rampColor(t).join(",")})`).join(",");
  return (
    <section className="dl-block" aria-label="Floor colours">
      <button type="button" role="switch" aria-checked={heat} className="dl-switch" onClick={() => patch({ heat: !heat })}>
        <span>Show sun hours on the floor</span>
        <i aria-hidden />
      </button>
      {heat && (
        <>
          <div className="dl-seg" role="group" aria-label="What the floor shows">
            <button type="button" aria-pressed={mode === "hours"} onClick={() => patch({ mode: "hours" })}>Hours of sun today</button>
            <button type="button" aria-pressed={mode === "now"} onClick={() => patch({ mode: "now" })}>Lit right now</button>
          </div>
          {hasResult && mode === "hours" && (
            <div className="dl-legend">
              <span className="label">Sun hours: 0 to {top} h</span>
              <i className="dl-ramp" style={{ background: `linear-gradient(90deg, ${ramp})` }} aria-hidden />
              <span className="dl-ends"><span>none</span><span>{top} h</span></span>
            </div>
          )}
          {hasResult && mode === "now" && (
            <div className="dl-legend">
              <span className="dl-key"><i style={{ background: `rgb(${rampColor(1).join(",")})` }} aria-hidden /> In direct sun at this time</span>
              <span className="dl-key"><i style={{ background: `rgb(${rampColor(0).join(",")})` }} aria-hidden /> In shade</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** "Sunlight in this room": move the sun through the day and the year and see where direct sun falls on a room's floor. */
export default function DaylightPanel({ onClose }: { onClose: () => void }) {
  const { open, close, patch, active, year, doy, hour, playing } = useDaylightPreview(
    useShallow((s) => ({ open: s.open, close: s.close, patch: s.patch, active: s.active, year: s.year, doy: s.doy, hour: s.hour, playing: s.playing })),
  );
  const plan = useStore((s) => s.plan);
  const { rooms, room, pick } = useRoom(plan);
  const { place, known } = usePlace();
  const bearing = plan.bearing ?? 0;
  const offset = localOffsetMinutes(year, doy);

  useEffect(() => {
    open();
    return close; // the real sky is back the moment the panel goes
  }, [open, close]);

  // the previewed sun: the 3D scene follows it for as long as the panel is open
  const sun = useMemo(() => sunAt(place, year, doy, hour, offset), [place, year, doy, hour, offset]);
  useEffect(() => {
    if (active) patch({ sun });
  }, [active, sun, patch]);

  // Play: a day in about 12 seconds; only while playing, and never by itself (nothing starts on open, so reduced motion is respected)
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => patch({ hour: (useDaylightPreview.getState().hour + TICK_HOURS) % 24 }), TICK_MS);
    return () => clearInterval(id);
  }, [playing, patch]);

  const light = useMemo(() => dayLight(place, year, doy, offset), [place, year, doy, offset]);
  const curve = useMemo(() => Array.from({ length: 49 }, (_, i) => sunAt(place, year, doy, i / 2, offset).elevation), [place, year, doy, offset]);
  const { status, progress, result, scene } = useDayResult(room, year, doy, place);
  const level = room ? levelIdOf(plan, room) : null;

  useEffect(() => patch({ result, levelId: result ? level : null }), [result, level, patch]);
  const lit = useMemo(() => (result && scene ? litCells(scene, result.grid, sun, bearing) : null), [result, scene, sun, bearing]);
  useEffect(() => patch({ lit }), [lit, patch]);

  const { month } = dateOfDay(year, doy);
  const summary = result && room ? sunSummary(room.name || "This room", result.steps, MONTH_NAMES[month], dayLabel(year, doy)) : null;
  const share = lit && result ? lit.reduce((n, v) => n + v, 0) / result.grid.cells : null;
  const levelCount = sortedLevels(plan).length;

  return (
    <HudPanel title="Sunlight in this room" onClose={onClose} className="drawer dl">
      <div className="dl-body">
        {rooms.length === 0 ? (
          <p className="hint">Draw a room first, then come back to see where the sun reaches it.</p>
        ) : (
          <label className="field dl-room">
            <span className="label">Room</span>
            <select value={room?.id ?? ""} onChange={(e) => pick(e.target.value)}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || "Room"}
                  {levelCount > 1 ? ` (${findLevel(plan, levelIdOf(plan, r)).name})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {room && (
          <section className="dl-answer" aria-live="polite" aria-label="Result">
            {summary ? <p className="dl-summary">{summary}.</p> : <p className="dl-summary muted">Working out the sun hours{status === "running" ? ` ${Math.round(progress * 100)}%` : ""}…</p>}
            {status === "running" && <progress className="dl-progress" max={1} value={progress} aria-label="Working out the sun hours" />}
          </section>
        )}

        <DateBlock place={place} />
        <TimeBlock light={light} />

        <section className="dl-block" aria-label="The sun now">
          <p className="dl-now-text">The sun is {sunWords(sun)}.</p>
          {share !== null && sun.elevation > 0 && <p className="dl-now-text">About {Math.round(share * 100)}% of this floor is in direct sun at this time.</p>}
          <DaylightSunPath curve={curve} hour={hour} elevation={sun.elevation} label={`Height of the sun through the day on ${dayLabel(year, doy)}. Now ${sunWords(sun)}.`} />
        </section>

        {room && <FloorBlock maxHours={result?.maxHours ?? 0} hasResult={!!result} />}

        <section className="dl-block dl-small" aria-label="Where and when">
          <p className="field-note">
            Sun for {coord(place.lat, "N", "S")}, {coord(place.lon, "E", "W")}
            {known ? " (your home's location)." : "."} Times are on this device's clock ({offsetLabel(offset)}), so they match the clock on the wall when the device is at home.
          </p>
          {!known && (
            <>
              <p className="field-note">Your home has no location yet, so these coordinates are used (Bucharest, to begin with). Set the real one under Surroundings, or type it here.</p>
              <PlaceFields place={place} />
            </>
          )}
        </section>

        <details className="dl-more">
          <summary>How this is worked out</summary>
          <p className="field-note">
            Direct sun only: no sky light and no weather. The sun is tested every 10 minutes from the floor up through the windows, past walls, fences, the ceiling, the roof's overhang and, when Surroundings is on, the neighbouring buildings.
            Windows let all the sun through (frames and bars are not counted), solid doors stop it, glass doors let it in. Trees, hills and furniture are ignored. Small errors near edges are normal.
          </p>
        </details>
      </div>
    </HudPanel>
  );
}
