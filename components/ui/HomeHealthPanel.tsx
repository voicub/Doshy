"use client";
import { useEffect, useState } from "react";
import { useAnomaly } from "@/lib/anomalyStore";
import { ALERT_MODES, ALERT_MODE_LABEL, visible } from "@/lib/anomalyPrefs";
import { useQuality } from "@/lib/quality";
import { useStore } from "@/lib/store";
import { levelIdOf } from "@/lib/levels";
import type { Anomaly, SparkLine } from "@/lib/anomalyTypes";
import { useItemFocus } from "../scene/itemFocus";
import HudPanel from "./HudPanel";
import "./homeHealth.css";

function Spark({ data }: { data: SparkLine }) {
  const values = [...data.v, ...data.lo, ...data.hi].filter((v): v is number => v !== null);
  if (!values.length) return <p className="field-note">No numeric history to chart.</p>;
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const x = (i: number) => 4 + i / Math.max(1, data.v.length - 1) * 292;
  const y = (v: number) => 66 - (v - low) / span * 60;
  const paths = (values: readonly (number | null)[]) => {
    let path = "";
    let start = true;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v === null) { start = true; continue; }
      path += `${start ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      start = false;
    }
    return path;
  };
  // Separate polygons avoid drawing a normal band across missing data.
  const bands: string[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length > 1) bands.push([...run.map((i) => `${x(i)},${y(data.hi[i]!)}`), ...[...run].reverse().map((i) => `${x(i)},${y(data.lo[i]!)}`)].join(" "));
    run = [];
  };
  for (let i = 0; i < data.v.length; i++) {
    if (data.lo[i] === null || data.hi[i] === null) flush();
    else run.push(i);
  }
  flush();
  return <figure className="hh-chart"><svg viewBox="0 0 300 72" role="img" aria-label={`Last 14 days in ${data.unit}; solid line readings, shaded band normal range`}>
    {bands.map((points, i) => <polygon key={i} points={points} className="hh-band" />)}
    <path d={paths(data.v)} className="hh-line" />
  </svg><figcaption>14 days · {data.unit} · shaded = usual range</figcaption></figure>;
}

function showOnModel(a: Anomaly) {
  const s = useStore.getState();
  s.setView("live");
  const target = a.itemId ? s.plan.items.find((i) => i.id === a.itemId) : a.roomId ? s.plan.rooms.find((r) => r.id === a.roomId) : undefined;
  if (target) s.setActiveLevel(levelIdOf(s.plan, target));
  if (a.roomId) s.setIsolatedRoom(a.roomId);
  if (a.itemId) useItemFocus.getState().frameItem(a.itemId);
  else if (a.openingId) useItemFocus.getState().pulseTarget(a.openingId, "opening");
  else if (a.roomId) useItemFocus.getState().pulseTarget(a.roomId, "room");
}

export default function HomeHealthPanel({ onClose }: { onClose: () => void }) {
  const { raw, prefs, status, scannedAt, wire, error, scan, later, normal, restore, setMode } = useAnomaly();
  const eco = useQuality((s) => s.tier === "eco");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const list = visible(prefs, raw, now);
  return <HudPanel title="Home health" onClose={onClose} meta={list.length ? String(list.length) : undefined} className="hh drawer">
    <div className="hh-body">
      <p className="field-note">Your linked sensors, compared with 21 days of their own history. Advice only; this never operates a device.</p>
      <div className="hh-bar"><span role="status">{status === "scanning" ? "Checking…" : scannedAt ? `Last checked ${new Date(scannedAt).toLocaleString()}` : "Not checked yet"}</span><button className="btn" disabled={status === "scanning"} onClick={() => void scan(true)}>Check now</button></div>
      {eco && <p className="field-note">Eco: manual Check now only. No background scans.</p>}
      {error && <p className="field-note warn" role="alert">{error}{scannedAt ? " Showing the last result; it may be out of date." : " Live sensor checks are still available."}</p>}
      {wire && Object.keys(wire.series).length === 0 && <p className="field-note">No numeric history was available. Recorder needs 14–30 days for useful learned comparisons.</p>}
      {status === "ready" && list.length === 0 && <p className="hh-normal" role="status">All normal — nothing unusual found in the available history.</p>}
      <label className="hh-setting">Anomaly alerts<select value={prefs.alerts} onChange={(e) => setMode(ALERT_MODES.find((m) => m === e.target.value) ?? "banner")}>{ALERT_MODES.map((mode) => <option key={mode} value={mode}>{ALERT_MODE_LABEL[mode]}</option>)}</select></label>
      <ul className="hh-list">{list.map((a) => <li key={a.id} className="hh-card" data-severity={a.severity}>
        <header><strong>{a.title}</strong><small>{a.severity}{a.roomName ? ` · ${a.roomName}` : ""}</small></header>
        <p>{a.message}</p>
        {a.spark && <Spark data={a.spark} />}
        <details><summary>What to check</summary><ul>{a.hints.map((hint) => <li key={hint}>{hint}</li>)}</ul></details>
        <div className="hh-actions"><button className="btn" onClick={() => later(a.id)}>Snooze 7 days</button><button className="btn" onClick={() => normal(a)}>This is normal</button>{(a.itemId || a.openingId || a.roomId) && <button className="btn" onClick={() => { showOnModel(a); onClose(); }}>Show on the model</button>}{a.rule === "water_night" && <button className="btn" onClick={() => document.dispatchEvent(new CustomEvent("housey:shutoff", { detail: { sensorOrRoom: a.entity } }))}>Find water shutoff</button>}</div>
      </li>)}</ul>
      {(prefs.ignored.length > 0 || Object.keys(prefs.snoozed).length > 0 || Object.keys(prefs.tolerance).length > 0) && <button className="btn" onClick={restore}>Reset snoozes and learned tolerances</button>}
    </div>
  </HudPanel>;
}
