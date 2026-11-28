"use client";
import type { ReactNode } from "react";
import { isOpenState, type HAState } from "@/lib/ha";
import { useStore } from "@/lib/store";
import {
  dutyPct, energyDelta, fmtDuration, fmtNum, fmtStamp, kwhFactor, minMaxAvg, numericSteps, onIntervals, totalMs, type Interval, type Series,
} from "@/lib/stats";
import MonoLabel from "../MonoLabel";
import { Gantt, Legend, TimeChart, holdTo, type GanttRow, type Line, type Pt } from "./charts";
import type { Ent, StatsSpec } from "./spec";
import type { StatsData } from "./useStatsData";

const ACCENT = "var(--accent)";
const INDOOR = [ACCENT, "var(--lg-b8c7d1)", "var(--lg-2f9fc0)", "var(--lg-6f8794)"];
const OUTDOOR = "var(--lg-6f8794)";

const numPts = (s: Series | undefined, to: number): Pt[] | null => (s?.kind === "num" && s.t.length ? holdTo(s.t.map((t, i) => ({ t, v: s.v[i] })), to) : null);
const numValues = (s: Series | undefined) => (s?.kind === "num" ? s.v : []);
const changesOf = (s: Series | undefined) => (s?.kind === "state" ? s.changes : null);

function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="st-sec">
      <header><MonoLabel>{title}</MonoLabel>{meta && <span className="st-meta">{meta}</span>}</header>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="st-empty">{children}</p>;

export function SkeletonSection({ title, height }: { title: string; height: number }) {
  return (
    <Section title={title}>
      <div className="sk st-sk" style={{ height }} aria-hidden />
    </Section>
  );
}

/** Lines for a list of sensors; entities without numeric history are flagged in the legend. */
function sensorLines(ents: Ent[], data: StatsData): { lines: Line[]; legend: { label: string; color: string; dash?: string; off?: boolean }[] } {
  const lines: Line[] = [];
  const legend: { label: string; color: string; dash?: string; off?: boolean }[] = [];
  let k = 0;
  for (const e of ents) {
    const color = e.outdoor ? OUTDOOR : INDOOR[k++ % INDOOR.length];
    const dash = e.outdoor ? "4 3" : undefined;
    const pts = numPts(data.series[e.id], data.to);
    if (pts) lines.push({ id: e.id, label: e.label, color, dash, pts });
    legend.push({ label: e.label, color, dash, off: !pts });
  }
  return { lines, legend };
}

const rangeOf = (lines: Line[]) => minMaxAvg(lines.flatMap((l) => l.pts.map((p) => p.v)));

export function TemperatureSection({ spec, data }: { spec: StatsSpec; data: StatsData }) {
  const { lines, legend } = sensorLines(spec.temps, data);
  const t = spec.thermostat;
  const setpoint = t ? changesOf(data.series[`${t}|temperature`]) : null;
  const action = t ? changesOf(data.series[`${t}|hvac_action`]) : null;
  const steps = setpoint ? numericSteps(setpoint, data.to) : [];
  const bands: Interval[] = action ? onIntervals(action, data.from, data.to, (s) => s === "heating") : [];
  if (steps.length) {
    lines.push({ id: "setpoint", label: "Setpoint", color: "var(--hi)", dash: "2 3", step: true, width: 1, pts: steps.map((p) => ({ t: p.t, v: p.v })) });
    legend.push({ label: "Setpoint", color: "var(--hi)", dash: "2 3" });
  }
  if (!lines.length) return <Section title="Temperature" meta="C"><Empty>No temperature sensors found in Home Assistant.</Empty></Section>;
  const r = rangeOf(lines);
  return (
    <Section title="Temperature" meta={r ? `${fmtNum(r.min)} - ${fmtNum(r.max)} C` : "C"}>
      <TimeChart from={data.from} to={data.to} lines={lines} unit="C" bands={bands} bandLabel={action ? "Heating" : undefined} summary={`Temperature chart, ${r ? `from ${fmtNum(r.min)} to ${fmtNum(r.max)} degrees` : "no data"}`} />
      <Legend items={[...legend, ...(action ? [{ label: "Heating", color: ACCENT, band: true }] : [])]} />
    </Section>
  );
}

export function HumiditySection({ spec, data }: { spec: StatsSpec; data: StatsData }) {
  const { lines, legend } = sensorLines(spec.hums, data);
  if (!lines.length) return <Section title="Humidity" meta="%"><Empty>No humidity sensors found in Home Assistant.</Empty></Section>;
  const r = rangeOf(lines);
  return (
    <Section title="Humidity" meta={r ? `${fmtNum(r.min, 0)} - ${fmtNum(r.max, 0)} %` : "%"}>
      <TimeChart from={data.from} to={data.to} lines={lines} unit="%" digits={0} height={120} summary={`Humidity chart, ${r ? `from ${fmtNum(r.min, 0)} to ${fmtNum(r.max, 0)} percent` : "no data"}`} />
      <Legend items={legend} />
    </Section>
  );
}

/** kWh used in the range: rise of the cumulative meter, else mean power x time. */
function kwhUsed(energy: Series | undefined, power: Series | undefined, unit: string | undefined, hours: number): number | null {
  if (energy?.kind === "num" && energy.v.length > 1) return energyDelta(energy.v) * kwhFactor(unit);
  const avg = power?.kind === "num" ? minMaxAvg(power.v)?.avg : undefined;
  return avg === undefined ? null : (avg * hours) / 1000;
}

export function PowerSection({ spec, data }: { spec: StatsSpec; data: StatsData }) {
  const states = useStore.getState().states;
  const hours = (data.to - data.from) / 3_600_000;
  const pts = spec.power ? numPts(data.series[spec.power], data.to) : null;
  const r = pts && minMaxAvg(pts.map((p) => p.v));
  if (!pts || !r) return <Section title="Power" meta="W"><Empty>No house power sensor found in Home Assistant.</Empty></Section>;
  const used = kwhUsed(spec.energy ? data.series[spec.energy] : undefined, spec.power ? data.series[spec.power] : undefined, spec.energy ? states[spec.energy]?.attributes.unit_of_measurement : undefined, hours);
  const consumers = spec.consumers
    .flatMap((c) => {
      const kwh = kwhUsed(c.energy ? data.series[c.energy] : undefined, c.power ? data.series[c.power] : undefined, c.energy ? states[c.energy]?.attributes.unit_of_measurement : undefined, hours);
      return kwh === null ? [] : [{ label: c.label, kwh, avg: c.power ? minMaxAvg(numValues(data.series[c.power]))?.avg : undefined }];
    })
    .sort((a, b) => b.kwh - a.kwh);
  const max = Math.max(0.001, ...consumers.map((c) => c.kwh));
  return (
    <Section title="Power" meta={used === null ? "W" : <><b className="st-big">{fmtNum(used, used < 10 ? 2 : 1)}</b> kWh used</>}>
      <TimeChart from={data.from} to={data.to} lines={[{ id: "p", label: "House", color: ACCENT, pts, area: true }]} unit="W" digits={0} zero height={120} summary={`Power chart, average ${fmtNum(r.avg, 0)} watts, peak ${fmtNum(r.max, 0)} watts`} />
      <p className="st-stats mono">AVG {fmtNum(r.avg, 0)} W<i /> PEAK {fmtNum(r.max, 0)} W<i /> MIN {fmtNum(r.min, 0)} W</p>
      {consumers.length > 0 && (
        <ul className="st-bars" aria-label="Top consumers">
          {consumers.map((c) => (
            <li key={c.label}>
              <span>{c.label}</span>
              <span className="st-track" role="img" aria-label={`${c.label} ${fmtNum(c.kwh, 2)} kilowatt hours`}><i style={{ width: `${Math.max(2, (100 * c.kwh) / max)}%` }} /></span>
              <em className="mono">{fmtNum(c.kwh, 2)} kWh{c.avg !== undefined ? ` / ${fmtNum(c.avg, 0)} W` : ""}</em>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function intervalsFor(e: Ent, data: StatsData, on: (s: string) => boolean): Interval[] | null {
  const ch = changesOf(data.series[e.id]);
  return ch ? onIntervals(ch, data.from, data.to, on) : null;
}

export function LightsSection({ spec, data }: { spec: StatsSpec; data: StatsData }) {
  if (!spec.lights.length) return <Section title="Lights"><Empty>No lights or light switches are linked in the plan.</Empty></Section>;
  const rows: (GanttRow & { ms: number })[] = spec.lights
    .map((e) => { const ivs = intervalsFor(e, data, (s) => s === "on"); return { id: e.id, label: e.label, ivs, ms: ivs ? totalMs(ivs) : -1 }; })
    .sort((a, b) => b.ms - a.ms);
  const all = rows.reduce((n, r) => n + Math.max(0, r.ms), 0);
  return (
    <Section title="Lights" meta={<>{fmtDuration(all)} total on</>}>
      <Gantt from={data.from} to={data.to} rows={rows} onLabel="on" summary={`Light timeline, ${rows.length} lights, ${fmtDuration(all)} on in total`} />
    </Section>
  );
}

export function OpeningsSection({ spec, data }: { spec: StatsSpec; data: StatsData }) {
  const states = useStore((s) => s.states);
  if (!spec.openings.length) return <Section title="Openings"><Empty>No windows or doors with a contact sensor are linked in the plan.</Empty></Section>;
  const live = (id: string) => isOpenState(states[id]);
  const rows: GanttRow[] = spec.openings.map((e) => ({
    id: e.id,
    label: e.label,
    ivs: intervalsFor(e, data, isOpenState),
    alert: live(e.id),
    sub: live(e.id) ? <b className="g-open">OPEN NOW</b> : undefined,
  }));
  const open = rows.filter((r) => r.alert).length;
  const log = spec.openings
    .flatMap((e, i) => (rows[i].ivs ?? []).map((iv) => ({ e, iv, now: rows[i].alert && iv.end >= data.to - 1 })))
    .sort((a, b) => b.iv.start - a.iv.start)
    .slice(0, 6);
  return (
    <Section title="Openings" meta={open ? <span className="st-alert">{open} OPEN NOW</span> : "ALL CLOSED"}>
      <Gantt from={data.from} to={data.to} rows={rows} onLabel="open" summary={`Openings timeline, ${open} currently open`} />
      {log.length === 0 ? <Empty>No openings in this range.</Empty> : (
        <ol className="st-log">
          {log.map(({ e, iv, now }) => (
            <li key={`${e.id}${iv.start}`} className={now ? "now" : ""}>
              <span>{e.label}</span>
              <em className="mono">{fmtStamp(iv.start)}{now ? " - now" : ` - ${fmtStamp(iv.end)}`}</em>
              <b className="mono">{fmtDuration(iv.end - iv.start)}</b>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

const num = (st: HAState | undefined) => (st && st.state !== "unavailable" && Number.isFinite(Number(st.state)) ? Number(st.state) : null);
const mean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

function Kpi({ label, value, unit, sub }: { label: string; value: string; unit: string; sub?: ReactNode }) {
  return (
    <div className="kpi">
      <MonoLabel>{label}</MonoLabel>
      <b className="mono">{value}<small>{unit}</small></b>
      <span className="mono">{sub ?? "\u00a0"}</span>
    </div>
  );
}

const range = (r: { min: number; max: number } | null, d = 1) => (r ? `${fmtNum(r.min, d)}-${fmtNum(r.max, d)}` : "--");

export function KpiRow({ spec, data }: { spec: StatsSpec; data: StatsData | null }) {
  const states = useStore((s) => s.states);
  const indoorT = spec.temps.filter((e) => !e.outdoor);
  const indoorH = spec.hums.filter((e) => !e.outdoor);
  const outT = spec.temps.find((e) => e.outdoor);
  const stat = (ents: Ent[]) => (data ? minMaxAvg(ents.flatMap((e) => numValues(data.series[e.id]))) : null);
  const t = num(states["sensor.mean_temperature"]) ?? mean(indoorT.map((e) => num(states[e.id])));
  const h = num(states["sensor.mean_humidity"]) ?? mean(indoorH.map((e) => num(states[e.id])));
  const o = outT ? num(states[outT.id]) : null;
  const p = spec.power ? num(states[spec.power]) : null;
  const pw = spec.power && data ? minMaxAvg(numValues(data.series[spec.power])) : null;
  const action = spec.thermostat && data ? changesOf(data.series[`${spec.thermostat}|hvac_action`]) : null;
  const heat = action && data ? onIntervals(action, data.from, data.to, (s) => s === "heating") : null;
  const f = (n: number | null, d = 1) => (n === null ? "--" : fmtNum(n, d));
  return (
    <div className="kpis">
      <Kpi label="Indoor" value={f(t)} unit="C" sub={data ? range(stat(indoorT)) : undefined} />
      <Kpi label="Outside" value={f(o)} unit="C" sub={data ? range(stat(outT ? [outT] : [])) : undefined} />
      <Kpi label="Humidity" value={f(h, 0)} unit="%" sub={data ? range(stat(indoorH), 0) : undefined} />
      <Kpi label="Power" value={f(p, 0)} unit="W" sub={pw ? `AVG ${fmtNum(pw.avg, 0)}` : undefined} />
      <Kpi label="Heating" value={heat && data ? f(dutyPct(heat, data.from, data.to), 0) : "--"} unit="%" sub={heat ? fmtDuration(totalMs(heat)) : undefined} />
    </div>
  );
}
