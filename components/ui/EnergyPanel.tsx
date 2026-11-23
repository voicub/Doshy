"use client";
import { useMemo } from "react";
import { formatPower, roleOf, sankeyOf, summarize, TONE_COLOR, type EnergyRole, type Sankey, type SankeyNode, type Summary } from "@/lib/flows";
import { useStore } from "@/lib/store";
import HudPanel from "./HudPanel";
import MonoLabel from "./MonoLabel";
import "./energy.css";

const NODE_LABEL: Record<SankeyNode["id"], string> = { solar: "Solar", battery: "Battery", grid: "Grid", home: "Home", ev: "EV", charge: "Charging", export: "To grid" };
const NODE_COLOR: Record<SankeyNode["id"], string> = {
  solar: TONE_COLOR.generation, battery: TONE_COLOR.generation, grid: TONE_COLOR.import, home: TONE_COLOR.consumption, ev: TONE_COLOR.consumption, charge: TONE_COLOR.generation, export: TONE_COLOR.export,
};
const W = 320;
const LABEL_W = 62;
const BAR_W = 7;
const MIN_NODE = 16;
const GAP = 8;
const SPAN = 96;

type Placed = SankeyNode & { y: number; h: number };
const place = (nodes: SankeyNode[], total: number): Placed[] => {
  let y = 0;
  return nodes.map((n) => {
    const h = Math.max(MIN_NODE, (n.w / total) * SPAN);
    const p = { ...n, y, h };
    y += h + GAP;
    return p;
  });
};

/** Two columns of bars (where the power comes from, where it goes) joined by ribbons as wide as the power between them. */
function SankeyView({ k }: { k: Sankey }) {
  const left = place(k.sources, k.total);
  const right = place(k.sinks, k.total);
  const height = Math.max(...[left, right].map((c) => (c.length ? c[c.length - 1].y + c[c.length - 1].h : 0)));
  const x0 = LABEL_W + BAR_W;
  const x1 = W - LABEL_W - BAR_W;
  const mid = (x0 + x1) / 2;
  const used = new Map<string, number>(); // how much of each node's bar the ribbons have taken so far
  const ribbons = k.links.map((l) => {
    const a = left.find((n) => n.id === l.from)!;
    const b = right.find((n) => n.id === l.to)!;
    const ta = (l.w / a.w) * a.h;
    const tb = (l.w / b.w) * b.h;
    const ya = a.y + (used.get(a.id) ?? 0);
    const yb = b.y + (used.get(b.id) ?? 0);
    used.set(a.id, (used.get(a.id) ?? 0) + ta);
    used.set(b.id, (used.get(b.id) ?? 0) + tb);
    const d = `M${x0},${ya} C${mid},${ya} ${mid},${yb} ${x1},${yb} L${x1},${yb + tb} C${mid},${yb + tb} ${mid},${ya + ta} ${x0},${ya + ta} Z`;
    return <path key={`${l.from}-${l.to}`} d={d} fill={NODE_COLOR[l.from]} opacity={0.32} />;
  });
  return (
    <svg className="en-sankey" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Where the power comes from and where it goes">
      {ribbons}
      {left.map((n) => (
        <g key={n.id}>
          <rect x={LABEL_W} y={n.y} width={BAR_W} height={n.h} fill={NODE_COLOR[n.id]} />
          <text x={LABEL_W - 6} y={n.y + n.h / 2 - 2} textAnchor="end">{NODE_LABEL[n.id]}</text>
          <text x={LABEL_W - 6} y={n.y + n.h / 2 + 9} textAnchor="end" className="v">{formatPower(n.value)}</text>
        </g>
      ))}
      {right.map((n) => (
        <g key={n.id}>
          <rect x={W - LABEL_W - BAR_W} y={n.y} width={BAR_W} height={n.h} fill={NODE_COLOR[n.id]} />
          <text x={W - LABEL_W + 6} y={n.y + n.h / 2 - 2}>{NODE_LABEL[n.id]}</text>
          <text x={W - LABEL_W + 6} y={n.y + n.h / 2 + 9} className="v">{formatPower(n.value)}</text>
        </g>
      ))}
    </svg>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="en-row">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

const has = (roles: Set<EnergyRole>, ...r: EnergyRole[]) => r.some((x) => roles.has(x));

function Totals({ s, roles }: { s: Summary; roles: Set<EnergyRole> }) {
  const grid = s.importW > 0 ? `${formatPower(s.importW)} importing` : s.exportW > 0 ? `${formatPower(s.exportW)} exporting` : "Idle";
  const battery = Math.abs(s.batteryW) < 15 ? "Idle" : `${formatPower(s.batteryW)} ${s.batteryW > 0 ? "charging" : "discharging"}`;
  return (
    <div className="en-rows">
      {has(roles, "solar", "inverter") && <Row label="Production" value={formatPower(s.productionW)} />}
      <Row label="Using now" value={formatPower(s.homeW + s.evW)} sub={s.evW > 0 ? `${formatPower(s.evW)} is the car` : undefined} />
      {has(roles, "battery") && <Row label="Battery" value={s.soc === undefined ? battery : `${Math.round(s.soc)}%`} sub={s.soc === undefined ? undefined : battery} />}
      {has(roles, "meter") && <Row label="Grid" value={grid} />}
      {has(roles, "charger", "car") && <Row label="Car charging" value={formatPower(s.evW)} />}
      {s.selfPct !== undefined && <Row label="Self-consumption" value={`${Math.round(s.selfPct)}%`} sub="of the solar power used at home" />}
    </div>
  );
}

/** Live energy summary of the flows in the plan: a Sankey of sources and uses, then the figures that matter (production, use, battery charge, grid, car, self-consumption). */
export default function EnergyPanel({ onClose }: { onClose: () => void }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const s = useMemo(() => summarize(plan, states), [plan, states]);
  const k = useMemo(() => sankeyOf(s), [s]);
  const roles = useMemo(() => new Set(plan.items.map((i) => roleOf(i.kind)).filter((r): r is EnergyRole => !!r)), [plan.items]);
  const batteries = roles.has("battery");
  return (
    <HudPanel title="Energy" meta="Live" onClose={onClose} className="energy sheet">
      {!s.live ? (
        <p className="en-empty">No energy lines yet. In Home Assistant mode, choose Connect energy and link a power sensor between two items.</p>
      ) : (
        <div className="en-body">
          {k.total > 0 ? <SankeyView k={k} /> : <p className="en-empty">Everything is idle right now.</p>}
          <Totals s={s} roles={roles} />
          {batteries && s.soc !== undefined && (
            <div className="en-soc" role="img" aria-label={`Battery charge ${Math.round(s.soc)} percent`}>
              <MonoLabel>Charge</MonoLabel>
              <div className="lb-meter"><i style={{ width: `${s.soc}%` }} /></div>
            </div>
          )}
        </div>
      )}
    </HudPanel>
  );
}
