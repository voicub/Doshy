"use client";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { CATALOG } from "@/lib/catalog";
import { WALKWAYS } from "@/lib/fit";
import { QUICK_SEARCHES, searchPieces } from "@/lib/fitCatalog";
import { planOfLevel } from "@/lib/levels";
import { activeLevelId, useStore } from "@/lib/store";
import { useFitResult } from "./MeasureFit";
import { useFitUi } from "./fitUi";
import { useMeasureSettings } from "./measureUi";

const cm = (m: number) => `${Math.round(m * 100)}`;
const COLOUR = { ok: "var(--ok-text)", tight: "var(--lg-ffb347-t)", blocked: "var(--lg-ff6a3d-t)" } as const;
const MIN_CM = 5;
const MAX_CM = 1000;

/** A size in centimetres: typing is free, a valid number (5 to 1000) is committed as it goes, and a number that changed from outside shows at once. */
function CmField({ label, value, onChange }: { label: string; value: number; onChange: (m: number) => void }) {
  const [text, setText] = useState(cm(value));
  useEffect(() => setText((t) => (Number(t) === Math.round(value * 100) ? t : cm(value))), [value]);
  return (
    <label className="mz-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={MIN_CM}
        max={MAX_CM}
        value={text}
        aria-invalid={!(Number(text) >= MIN_CM && Number(text) <= MAX_CM)}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (n >= MIN_CM && n <= MAX_CM) onChange(n / 100);
        }}
      />
      <i>cm</i>
    </label>
  );
}

/** "Does it fit here?": pick a piece (search the catalogue, or type a size), turn it, say whether its doors open, choose the walkway; the verdict is in plain words. */
export default function MeasureBarFit() {
  const ui = useFitUi();
  const walkway = useMeasureSettings((s) => s.walkway);
  const patch = useMeasureSettings((s) => s.patch);
  const full = useStore((s) => s.plan);
  const level = useStore(activeLevelId);
  const plan = useMemo(() => planOfLevel(full, level), [full, level]);
  const { trying, verdict } = useFitResult(plan);
  const matches = useMemo(() => searchPieces(CATALOG, ui.query), [ui.query]);

  const pick = (m: (typeof matches)[number]) => ui.set({ piece: m, custom: false, opens: null, leaf: null, turned: false });
  const customise = () => ui.set({ custom: true, cw: ui.piece?.w ?? ui.cw, cd: ui.piece?.d ?? ui.cd, opens: null, leaf: null });
  const swing = trying?.swing ?? null;

  return (
    <>
      <span className="mz-verdict" role="status" style={verdict ? { color: COLOUR[verdict.level], borderColor: COLOUR[verdict.level] } : undefined}>
        {verdict ? verdict.text : trying ? "Move over the plan to try it." : "Pick a piece to try."}
      </span>
      <label className="mz-search search">
        <input type="search" placeholder="Find a piece: sofa, bed, wardrobe" aria-label="Find a piece of furniture" value={ui.query} onChange={(e) => ui.set({ query: e.target.value })} />
      </label>
      {!matches.length && !ui.query && QUICK_SEARCHES.map((q) => <button key={q} type="button" className="mz-chip" onClick={() => ui.set({ query: q })}>{q}</button>)}
      {matches.map((m) => (
        <button key={m.kind} type="button" className="mz-chip mz-piece" aria-pressed={!ui.custom && ui.piece?.kind === m.kind} onClick={() => pick(m)} title={`${m.label}, ${cm(m.w)} x ${cm(m.d)} cm`}>
          {m.label}
          <small>{`${cm(m.w)} × ${cm(m.d)}`}</small>
        </button>
      ))}
      <button type="button" className="mz-chip" aria-pressed={ui.custom} onClick={() => (ui.custom ? ui.set({ custom: false }) : customise())}>Custom size</button>
      {ui.custom && (
        <>
          <CmField label="Width" value={ui.cw} onChange={(cw) => ui.set({ cw })} />
          <CmField label="Depth" value={ui.cd} onChange={(cd) => ui.set({ cd })} />
        </>
      )}
      <button type="button" className="mz-chip" disabled={!trying} aria-pressed={ui.turned} onClick={() => ui.set({ turned: !ui.turned })} title="Turn the piece a quarter turn">
        <ArrowClockwiseIcon size={14} />
        Rotate 90°
      </button>
      <button type="button" className="mz-chip" disabled={!trying} aria-pressed={!!swing} onClick={() => ui.set({ opens: !swing })} title="Wardrobe, cabinet and cupboard doors swing out in front of the piece">
        Doors open outward
      </button>
      {swing && <CmField label="Door swing" value={swing.depth} onChange={(leaf) => ui.set({ leaf })} />}
      <div className="mz-walk" role="group" aria-label="Walkway width">
        <span className="field-note mz-note">Walkway</span>
        {WALKWAYS.map((w) => (
          <button key={w} type="button" className="mz-chip" aria-pressed={walkway === w} onClick={() => patch({ walkway: w })}>{`${cm(w)} cm`}</button>
        ))}
      </div>
      <span className="field-note mz-note">Move over the plan, click to hold the piece still. Turn it with Rotate.</span>
    </>
  );
}
