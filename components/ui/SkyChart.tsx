"use client";
import { useId, useMemo, useState } from "react";
import { issLookAt, predictIssPasses } from "@/lib/iss";
import { useIss } from "@/lib/issUse";
import { moonPhase } from "@/lib/moon";
import { bodiesAt, extinctionMag, limitingMagnitude } from "@/lib/nightsky";
import { equatorialToScene } from "@/lib/nightskyFrame";
import { useNightSkySettings } from "@/lib/nightskySettings";
import { nightAnchor, sunTimes, tonight } from "@/lib/nightskyTimes";
import { useHomePlace } from "@/lib/nightskyUse";
import { chartPoint, compassPoints, directionWord, heightWord, southUp } from "@/lib/skyChart";
import { constellationLabels, linesPath, starLabels, starPaths } from "@/lib/skyChartDraw";
import { getStars } from "@/lib/stars";
import { useSky } from "@/lib/useSky";
import HudPanel from "./HudPanel";
import SeasonPreview from "./SeasonPreview";
import useRestoreFocus from "./useRestoreFocus";
import "./skyChart.css";

const time = (date: Date | null) => date ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
const at = (flip: boolean) => (alt: number, az: number) => { const p = chartPoint(alt, az, flip); return { x: p.x * 96, y: p.y * 96 }; };

/** The same J2000 catalogue and horizon transform as the dome; chart north is geographic, never the plan's bearing. */
export function SkyMap({ date, place, limit, lines, iss }: { date: Date; place: { lat: number; lon: number }; limit: number; lines: boolean; iss?: { elevation: number; azimuth: number } }) {
  const clip = useId();
  const flip = southUp(place.lat);
  const matrix = useMemo(() => equatorialToScene(date, place.lat, place.lon, 0), [date, place.lat, place.lon]);
  const paths = useMemo(() => starPaths(getStars(), matrix, at(flip), limit), [matrix, flip, limit]);
  const line = useMemo(() => linesPath(getStars(), matrix, at(flip)), [matrix, flip]);
  const labels = useMemo(() => starLabels(getStars(), matrix, at(flip), 10), [matrix, flip]);
  const constellations = useMemo(() => constellationLabels(getStars(), matrix, at(flip)), [matrix, flip]);
  const bodies = useMemo(() => bodiesAt(date, place.lat, place.lon).filter((b) => b.id !== "sun" && b.alt >= 0), [date, place.lat, place.lon]);
  return <svg className="sky-map" viewBox="-116 -116 232 232" role="img" aria-label={`Sky above ${place.lat.toFixed(2)}, ${place.lon.toFixed(2)} at ${date.toLocaleString()}; zenith at centre, ${flip ? "south" : "north"} at top`}>
    <defs><clipPath id={clip}><circle r="96" /></clipPath></defs>
    <circle className="sky-rim" r="96" /><circle className="sky-grid" r="64" /><circle className="sky-grid" r="32" />
    <path className="sky-grid" d="M-96 0H96M0-96V96" />
    {compassPoints(flip).map(({ label, at: p }) => <text key={label} className="sky-compass" x={p.x * 107} y={p.y * 107 + 3}>{label}</text>)}
    <g clipPath={`url(#${clip})`}>
      {lines && <path className="sky-lines" d={line} />}
      {paths.map((p, i) => <path key={i} className={`sky-stars ${p.tone}`} d={p.d} strokeWidth={p.width} />)}
      {lines && constellations.map((n) => <text key={n.name} className="sky-constellation" x={n.x} y={n.y}>{n.name}</text>)}
      {labels.map((n) => <text key={n.name} className="sky-star-label" x={n.x + 2} y={n.y - 2}>{n.name}</text>)}
      {bodies.map((b) => { const p = at(flip)(b.alt, b.az); return <g key={b.id} className={`sky-body ${b.id}`}><circle cx={p.x} cy={p.y} r={b.id === "moon" ? 3 : 2} /><text x={p.x + 4} y={p.y + 1}>{b.name}</text></g>; })}
      {iss && iss.elevation > 0 && (() => { const p = at(flip)(iss.elevation, iss.azimuth); return <g className="sky-body iss"><circle cx={p.x} cy={p.y} r="2" /><text x={p.x + 4} y={p.y}>ISS</text></g>; })()}
    </g>
    <text className="sky-zenith" x="3" y="-3">Zenith</text>
  </svg>;
}

export function SkyTonight({ compact = false }: { compact?: boolean }) {
  const sky = useSky();
  const place = useHomePlace();
  const [minutes, setMinutes] = useState<number | null>(null);
  const lines = useNightSkySettings((s) => s.lines);
  const issEnabled = useNightSkySettings((s) => s.iss);
  const date = useMemo(() => minutes === null ? sky.now : new Date(nightAnchor(sky.now, place.lon).getTime() + minutes * 60000), [sky.now, place.lon, minutes]);
  const night = useMemo(() => tonight(sky.now, place.lat, place.lon), [sky.now, place.lat, place.lon]);
  const sun = useMemo(() => sunTimes(sky.now, place.lat, place.lon), [sky.now, place.lat, place.lon]);
  const bodies = useMemo(() => bodiesAt(date, place.lat, place.lon), [date, place.lat, place.lon]);
  const phase = moonPhase(date);
  const limit = limitingMagnitude(bodies.find((b) => b.id === "sun")?.alt ?? 90, bodies.find((b) => b.id === "moon")?.alt ?? -90, phase.illumination, sky.weather.cloud);
  const station = useIss(issEnabled && limit > -1.5, place);
  const look = station.fix ? issLookAt(station.fix, station.prevFix, date, place.lat, place.lon) : undefined;
  const passes = useMemo(() => station.fix ? predictIssPasses(station.fix, station.prevFix, place.lat, place.lon, sky.now, 12).filter((p) => p.maxElevation >= 10).slice(0, 3) : [], [station.fix, station.prevFix, place, sky.now]);
  const shownMinute = minutes ?? Math.max(0, Math.min(1440, Math.round((date.getTime() - nightAnchor(sky.now, place.lon).getTime()) / 60000)));
  return <div className={`sky-tonight ${compact ? "sky-wall" : ""}`}>
    <div className="sky-chart-picture"><SkyMap date={date} place={place} limit={limit} lines={lines} iss={look} /><p className="field-note">{date.toLocaleString()} · {place.lat.toFixed(2)}°, {place.lon.toFixed(2)}°<br />Looking up: east is left. {southUp(place.lat) ? "South" : "North"} at top.</p></div>
    {!compact && <div className="sky-chart-controls">
      <label className="field"><span className="label">Time tonight · {time(date)}</span><input aria-label="Time tonight" type="range" min="0" max="1440" step="5" value={shownMinute} onChange={(e) => setMinutes(Number(e.target.value))} /></label>
      <button className="btn" type="button" disabled={minutes === null} onClick={() => setMinutes(null)}>Live time</button>
      <SeasonPreview />
      <label><input type="checkbox" checked={lines} onChange={(e) => useNightSkySettings.getState().set({ lines: e.target.checked })} /> Constellation lines</label>
      <label><input type="checkbox" checked={issEnabled} onChange={(e) => useNightSkySettings.getState().set({ iss: e.target.checked })} /> ISS (optional external position)</label>
    </div>}
    <section className="sky-summary" aria-label="What is up tonight"><h3>What is up tonight</h3>
      <p>{night.moon.name.replaceAll("_", " ")} · {Math.round(night.moon.illumination * 100)}% lit · Moon rise {time(night.moon.rise)}, set {time(night.moon.set)}</p>
      <ul>{night.planets.filter((p) => p.visible).map((p) => <li key={p.id}><b>{p.name}</b> {time(p.from)}–{time(p.to)} · best {Math.round(p.bestAlt)}° {directionWord(p.bestAz)}</li>)}</ul>
      <p>Sunset {time(sun.sunset)} · sunrise {time(sun.sunrise)}<br />Civil dusk {time(sun.civilDusk)} · dawn {time(sun.civilDawn)}<br />Astronomical dusk {time(sun.astroDusk)} · dawn {time(sun.astroDawn)}{sun.polar && ` · Polar ${sun.polar}`}</p>
      <ul>{bodies.filter((b) => b.id !== "sun" && b.alt > 0 && (b.id === "moon" || b.mag + extinctionMag(b.alt) < limit)).map((b) => <li key={b.id}>Now: {b.name} {heightWord(b.alt)} in the {directionWord(b.az)}</li>)}</ul>
      {issEnabled && <><p>{station.status === "disabled" ? "ISS disabled by server external-data setting." : station.status === "unavailable" ? "ISS position unavailable; stars and planets still work offline." : look && look.elevation > 0 ? `ISS overhead for the next minutes · ${Math.round(look.elevation)}° ${directionWord(look.azimuth)}` : station.fix ? "ISS below the horizon at this time." : limit <= -1.5 ? "ISS polling waits for night." : "Finding the ISS…"}</p><ul>{passes.map((p) => <li key={p.start.toISOString()}>ISS approx. {time(p.start)}–{time(p.end)} · maximum {Math.round(p.maxElevation)}°</li>)}</ul><p className="field-note">ISS passes are approximate circular-orbit estimates, not guaranteed sightings; daylight and Earth's shadow can hide it.</p></>}
    </section>
  </div>;
}

export default function SkyChart({ onClose }: { onClose: () => void }) {
  useRestoreFocus();
  return <HudPanel title="Tonight's sky" onClose={onClose} className="sky-chart sheet"><div className="sky-chart-scroll"><SkyTonight /></div></HudPanel>;
}
