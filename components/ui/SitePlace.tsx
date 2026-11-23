"use client";
import { MapPinIcon } from "@phosphor-icons/react";
import { useEffect, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { homeOf } from "@/lib/geo";
import type { Site } from "@/lib/siteTypes";
import { parseCoords, parseNumber } from "@/lib/siteUi";
import { useStore } from "@/lib/store";
import MonoLabel from "./MonoLabel";
import { Block, Switch } from "./SiteBits";

const show = (v: number | undefined) => (v === undefined ? "" : String(v));
const at = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

/** Why a typed latitude / longitude is not usable; undefined when it is fine or still empty. */
function problem(text: string, max: number, name: string): string | undefined {
  if (!text.trim()) return undefined;
  const v = parseNumber(text);
  if (v === null) return `${name} is a number such as 51.4779.`;
  return Math.abs(v) > max ? `${name} is between -${max} and ${max}.` : undefined;
}

/** Which place is used: Home Assistant's home, or coordinates typed or pasted here. */
export default function SitePlace({ site }: { site: Site }) {
  const home = homeOf(useStore((s) => s.states));
  const setSite = useStore((s) => s.setSite);
  const manual = site.source === "manual";
  const [lat, setLat] = useState(show(site.lat));
  const [lon, setLon] = useState(show(site.lon));
  // undo (or a loaded plan) changes the stored coordinates: show them
  useEffect(() => {
    setLat(show(site.lat));
    setLon(show(site.lon));
  }, [site.lat, site.lon]);

  const latBad = problem(lat, 90, "Latitude");
  const lonBad = problem(lon, 180, "Longitude");
  const commit = (la: string, lo: string) => {
    const [a, b] = [parseNumber(la), parseNumber(lo)];
    if (a !== null && b !== null && !problem(la, 90, "") && !problem(lo, 180, "")) setSite({ source: "manual", lat: Math.round(a * 1e6) / 1e6, lon: Math.round(b * 1e6) / 1e6 });
  };
  /** Pasting "51.48, 0.12" (from a map app) into either box fills both. Typing is left alone: a half-typed pair must not jump. */
  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pair = parseCoords(e.clipboardData.getData("text"));
    if (!pair) return;
    e.preventDefault();
    setLat(String(pair.lat));
    setLon(String(pair.lon));
    setSite({ source: "manual", ...pair });
  };
  const enter = (e: KeyboardEvent) => e.key === "Enter" && commit(lat, lon);

  const place = manual && site.lat !== undefined && site.lon !== undefined ? `Your coordinates: ${at(site.lat, site.lon)}` : home ? `Home Assistant's home location: ${at(home.lat, home.lon)}` : null;
  const typing = manual || !home;

  return (
    <Block title="Where" name="where">
      <p className="sp-place">
        <MapPinIcon size={16} weight="fill" aria-hidden />
        <span>{place ?? "No home location in Home Assistant. Enter coordinates below."}</span>
      </p>
      {home && <Switch on={manual} label="Use other coordinates" onChange={(on) => setSite(on ? { source: "manual", lat: Math.round(home.lat * 1e6) / 1e6, lon: Math.round(home.lon * 1e6) / 1e6 } : { source: "home" })} />}
      {typing && (
        <div className="sp-coords">
          <label className="field">
            <MonoLabel>Latitude</MonoLabel>
            <input inputMode="decimal" enterKeyHint="done" value={lat} placeholder="51.4779" aria-invalid={!!latBad} aria-describedby={latBad ? "sp-lat-err" : undefined} onChange={(e) => setLat(e.target.value)} onPaste={paste} onBlur={() => commit(lat, lon)} onKeyDown={enter} />
          </label>
          <label className="field">
            <MonoLabel>Longitude</MonoLabel>
            <input inputMode="decimal" enterKeyHint="done" value={lon} placeholder="-0.0015" aria-invalid={!!lonBad} aria-describedby={lonBad ? "sp-lon-err" : undefined} onChange={(e) => setLon(e.target.value)} onPaste={paste} onBlur={() => commit(lat, lon)} onKeyDown={enter} />
          </label>
          {latBad && <p id="sp-lat-err" className="field-note warn" role="alert">{latBad}</p>}
          {lonBad && <p id="sp-lon-err" className="field-note warn" role="alert">{lonBad}</p>}
          <p className="field-note">Tip: paste a pair such as 51.4779, -0.0015 (from a map app) into either box.</p>
        </div>
      )}
    </Block>
  );
}
