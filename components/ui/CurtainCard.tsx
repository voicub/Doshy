"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CATALOG } from "@/lib/catalog";
import { autoLine, blackoutDawnOn, curtainLayers, curtainRig, LAYER_NAME, opennessWords, type AutoNote, type CurtainLayer } from "@/lib/curtain";
import { domainOf, type HAState } from "@/lib/ha";
import { isRecord } from "@/lib/guards";
import { REQUEST_TIMEOUT_MS, within } from "@/lib/requestTimeout";
import { useStore } from "@/lib/store";
import { hudScale, hudViewport } from "@/lib/displayStore";
import HudPanel from "./HudPanel";
import MonoLabel from "./MonoLabel";
import { patchState, runService, type CurtainTarget, type ServiceData } from "./serviceActions";
import { useDismiss } from "./useDismiss";
import "./curtainCard.css";
import DeviceGlyph from "./DeviceGlyph";

const WIDTH = 320;
const SLIDER_PAUSE_MS = 350;
const AUTO_POLL_MS = 30_000;

/** One cover command. `position` is shown right away (and rolled back when Home Assistant refuses); resolves to a plain error sentence, or null when it went through. */
async function coverCall(entity: string, service: string, what: string, data?: ServiceData, position?: number): Promise<string | null> {
  const before = useStore.getState().states[entity];
  if (position !== undefined && before) patchState(entity, typeof before.attributes.current_position === "number" ? { current_position: position } : {}, position <= 0 ? "closed" : "open");
  const err = await runService({ domain: "cover", service, entity_id: entity, data });
  if (!err) return null;
  if (before) useStore.setState((s) => ({ states: { ...s.states, [entity]: before } }));
  return `Could not ${what}: ${err}`;
}

/** The note for one item out of the `GET /api/automation/curtains` payload; anything that is not shaped like a note reads as none. */
function autoNoteFor(payload: unknown, itemId: string): AutoNote | undefined {
  const note = isRecord(payload) && isRecord(payload.items) ? payload.items[itemId] : undefined;
  if (!isRecord(note) || typeof note.at !== "number" || typeof note.why !== "string") return undefined;
  const { action } = note;
  return action === "close" || action === "open" || action === "skip" ? { at: note.at, action, why: note.why } : undefined;
}

/** The last thing the dawn rule did for this curtain (GET /api/automation/curtains). Nothing until the server has recorded something, or when it cannot be reached. */
function useAutoNote(itemId: string, on: boolean): AutoNote | undefined {
  const [note, setNote] = useState<AutoNote>();
  useEffect(() => {
    if (!on) return;
    let live = true;
    const load = () =>
      fetch("/api/automation/curtains", { cache: "no-store", signal: within(REQUEST_TIMEOUT_MS) })
        .then((r) => (r.ok ? r.json() : undefined))
        .then((j: unknown) => live && setNote(autoNoteFor(j, itemId)))
        .catch(() => undefined); // no record to show is the same as no line: the card works without it
    void load();
    const t = setInterval(load, AUTO_POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [itemId, on]);
  return note;
}

/** Range input that shows the drag locally and sends once the user pauses. */
function Position({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [local, setLocal] = useState<number | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = local ?? value;
  return (
    <label className="dc-row">
      <MonoLabel>Open</MonoLabel>
      <input
        type="range"
        className="rng"
        min={0}
        max={100}
        step={1}
        value={shown}
        aria-label={label}
        aria-valuetext={`${Math.round(shown)}% open`}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v);
          clearTimeout(timer.current);
          timer.current = window.setTimeout(() => { onCommit(v); setLocal(null); }, SLIDER_PAUSE_MS);
        }}
      />
      <span className="t-val dc-val">{`${Math.round(shown)}%`}</span>
    </label>
  );
}

type LayerProps = { layer: CurtainLayer; entity: string; st: HAState | undefined; itemId: string; note?: AutoNote; error: string | null; setError: (e: string | null) => void; children?: ReactNode };

function Layer({ layer, entity, st, itemId, note, error, setError, children }: LayerProps) {
  const name = LAYER_NAME[layer];
  const cover = domainOf(entity) === "cover";
  const bad = !st || st.state === "unavailable" || st.state === "unknown";
  const pos = st?.attributes.current_position;
  const send = async (service: string, what: string, data?: ServiceData, position?: number) => {
    setError(await coverCall(entity, service, `${what} the ${name.toLowerCase()}`, data, position));
  };
  const words = bad ? "Not reporting" : typeof pos === "number" ? opennessWords(pos / 100) : st.state.replace(/_/g, " ");
  return (
    <section className="cc-layer" aria-label={name} data-layer={layer} data-item={itemId}>
      <div className="dc-state">
        <MonoLabel><DeviceGlyph itemId={itemId} entity={entity} /> {name}</MonoLabel>
        <span className={`t-val ${bad ? "warn" : ""}`}>{words}</span>
      </div>
      <small className="cc-entity">{st?.attributes.friendly_name ?? entity}</small>
      {cover && !bad && (
        <>
          <div className="dc-row dc-transport">
            <button className="btn dc-btn" onClick={() => void send("open_cover", "open", undefined, 100)}>Open</button>
            <button className="btn dc-btn" onClick={() => void send("stop_cover", "stop")}>Stop</button>
            <button className="btn dc-btn" onClick={() => void send("close_cover", "close", undefined, 0)}>Close</button>
          </div>
          {typeof pos === "number" && <Position label={`${name} position`} value={pos} onCommit={(v) => void send("set_cover_position", "move", { position: v }, v)} />}
        </>
      )}
      {!cover && <small className="field-note">It follows {entity} by itself, so there is nothing to press here.</small>}
      {children}
      {note && layer === "blackout" && <small className="cc-auto" role="status">{autoLine(note)}</small>}
      {error && <p className="field-note warn" role="alert">{error}</p>}
    </section>
  );
}

/** Floating card for a window curtain in Live mode: each layer (sheer, sun-blocking) opens, closes, stops and moves to a position by its own cover. Only user taps send anything. */
export default function CurtainCard({ target, onClose }: { target: CurtainTarget; onClose: () => void }) {
  const item = useStore((s) => s.plan.items.find((i) => i.id === target.itemId));
  const states = useStore((s) => s.states);
  const patch = useStore((s) => s.patch);
  const root = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Partial<Record<CurtainLayer, string | null>>>({});
  const layers = item ? curtainLayers(item) : undefined;
  const rig = item ? curtainRig(CATALOG[item.kind]?.parts ?? []) : null;
  const note = useAutoNote(target.itemId, !!rig?.blackout && !!layers?.blackout.entity);

  useEffect(() => {
    if (!item) onClose();
  }, [item, onClose]);
  useDismiss(root, onClose);
  useEffect(() => { root.current?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true }); }, [target.itemId]);

  if (!item || !layers || !rig) return null;
  const style =
    target.x != null && target.y != null
      ? { left: Math.max(12, Math.min(hudViewport().width - WIDTH - 12, target.x / hudScale() + 18)), top: Math.max(60, Math.min(hudViewport().height - 420, target.y / hudScale() - 40)) }
      : undefined;
  const shown = (["sheer", "blackout"] as const).flatMap((l) => {
    const entity = layers[l].entity;
    return rig[l] && entity ? [{ l, entity }] : [];
  });
  const dawnOn = blackoutDawnOn(item.params, layers.blackout.entity);
  const setDawn = (on: boolean) => patch("item", item.id, { params: { ...item.params, blackoutDawn: on } });
  const label = CATALOG[item.kind]?.label;

  return (
    <div ref={root} className={`devcard ${style ? "" : "center"}`} style={style} role="dialog" aria-label={`Curtain ${label ?? item.kind}`}>
      <HudPanel title="Curtain" meta={label} onClose={onClose} className="dc cc">
        {shown.map(({ l, entity }) => {
          return (
            <Layer key={l} layer={l} entity={entity} st={states[entity]} itemId={item.id} note={note} error={errors[l] ?? null} setError={(e) => setErrors((x) => ({ ...x, [l]: e }))}>
              {l === "blackout" && domainOf(entity) === "cover" && (
                <div className="cc-dawn">
                  <button role="switch" aria-checked={dawnOn} className="cc-sw" onClick={() => setDawn(!dawnOn)}>
                    <i />
                    <span>Close at dawn</span>
                  </button>
                  <small className="field-note">Closes by itself at first light, once a day.</small>
                </div>
              )}
            </Layer>
          );
        })}
      </HudPanel>
    </div>
  );
}
