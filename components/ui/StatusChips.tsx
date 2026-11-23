"use client";
import { ThermometerIcon, BrowserIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { climateIds, climateInfo } from "@/lib/climate";
import { openOpenings } from "@/lib/openings";
import { useStore } from "@/lib/store";
import { selectStates } from "@/lib/statesMerge";
import { useSky } from "@/lib/useSky";
import { useClickAway } from "./useDismiss";
import MonoLabel from "./MonoLabel";

const f1 = (n: number) => n.toFixed(1);
/** The thermostat the chip shows (the first climate entity with a reading): the chip re-renders only when that one entity changes. */
const firstClimate = selectStates((states) => states[climateIds(states)[0]]);

/** Thermostat at a glance: `CLIMATE 22.3 > 22.0 HEATING`. Opens the climate panel. */
export function ClimateChip({ onClick, active }: { onClick: () => void; active: boolean }) {
  const st = useStore(firstClimate);
  if (!st) return null;
  const c = climateInfo(st);
  const off = st.state === "off";
  const heating = c.action === "heating";
  const action = off ? "OFF" : heating ? "HEATING" : (c.action ?? "idle").toUpperCase();
  const temps = `${c.current != null ? f1(c.current) : "--"} > ${c.target != null ? f1(c.target) : "--"}`;
  return (
    <button className={`t-btn t-climate ${heating ? "heating" : ""}`} aria-pressed={active} aria-label={`Climate: ${temps.replace(">", "to target")} degrees, ${action.toLowerCase()}. Open thermostat`} title="Thermostat (H)" onClick={onClick}>
      <ThermometerIcon size={15} />
      <MonoLabel className="t-lbl">Climate</MonoLabel>
      <span className="t-val">{temps}</span>
      <span className="t-act">{action}</span>
    </button>
  );
}

/** Open windows and doors (from contact sensors linked in the plan). Click for the list; a row focuses its room. */
export function OpenChip() {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const setFocusRoom = useStore((s) => s.setFocusRoom);
  const raining = ["rain", "storm"].includes(useSky().weather.kind);
  const open = useMemo(() => openOpenings(plan, states), [plan, states]);
  const [list, setList] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useClickAway(root, () => setList(false), list);
  useEffect(() => { if (!open.length) setList(false); }, [open.length]);

  if (!open.length) return null;
  const rainIn = raining && open.some((o) => o.exterior);
  const names = open.map((o) => `${states[o.entity]?.attributes.friendly_name ?? o.entity}`).join(", ");
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setList(false); btn.current?.focus(); }
  };
  return (
    <div className="t-weather" ref={root}>
      <button ref={btn} className={`t-btn t-open ${rainIn ? "rain" : ""}`} aria-haspopup="true" aria-expanded={list} aria-label={`${open.length} open: ${names}${rainIn ? ". Rain is coming in" : ""}`} onClick={() => setList((l) => !l)}>
        <BrowserIcon size={15} />
        <span className="t-val">{`OPEN ${open.length}`}</span>
        {rainIn && <span className="t-act">RAIN IN</span>}
      </button>
      {list && (
        <div className="t-menu hud t-openlist" role="group" aria-label="Open windows and doors" onKeyDown={onKey}>
          {open.map((o) => {
            const room = o.roomIds[0];
            const name = states[o.entity]?.attributes.friendly_name ?? o.entity;
            return (
              <button key={o.opening.id} className="t-item" onClick={() => { useStore.getState().setView("live"); if (room) setFocusRoom(room); setList(false); }}>
                <span>{name}</span>
                <small>{`${o.opening.type}${o.rooms.length ? `, ${o.rooms.join(" / ")}` : ""}${rainIn && o.exterior ? ", rain in" : ""}`}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
