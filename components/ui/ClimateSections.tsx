"use client";
import type { HAState } from "@/lib/ha";
import type { RoomTemp } from "@/lib/climate";
import { useStore } from "@/lib/store";
import { fmt } from "./ClimateDial";
import MonoLabel from "./MonoLabel";
import Sparkline, { type Line } from "./Sparkline";

type Trends = Record<string, Line>;

const words = (s: string) => s.replace(/_/g, " ");

/** A titled row of exclusive chips (HVAC mode, preset). */
export function ChipSection({ title, ariaLabel, modes, isOn, onPick }: { title: string; ariaLabel: string; modes: string[]; isOn: (mode: string) => boolean; onPick: (mode: string) => void }) {
  return (
    <div className="cl-sec">
      <MonoLabel>{title}</MonoLabel>
      <div className="eb-chips" role="group" aria-label={ariaLabel}>
        {modes.map((m) => (
          <button key={m} className="eb-chip" aria-pressed={isOn(m)} onClick={() => onPick(m)}>{words(m)}</button>
        ))}
      </div>
    </div>
  );
}

/** Outdoor temperature and humidity from the weather entity, plus the thermostat's indoor humidity. */
export function OutsideSection({ weather, indoorHumidity }: { weather: HAState["attributes"] | undefined; indoorHumidity: number | undefined }) {
  return (
    <div className="cl-sec">
      <MonoLabel>Outside</MonoLabel>
      <div className="cl-out">
        <span className="t-val">{weather?.temperature != null ? `${Math.round(weather.temperature * 10) / 10} C` : "-- C"}</span>
        <span className="t-val">{weather?.humidity != null ? `${Math.round(weather.humidity)} %` : "-- %"}</span>
        {indoorHumidity != null && <span className="t-val muted">{`indoor ${Math.round(indoorHumidity)} %`}</span>}
      </div>
    </div>
  );
}

/** Each room's temperature against the target, with a 6 h trend; a tap focuses the room in Live mode. */
export function RoomsSection({ rooms, target, trends }: { rooms: RoomTemp[]; target: number; trends: Trends }) {
  return (
    <div className="cl-sec">
      <MonoLabel>Rooms vs target, last 6 h</MonoLabel>
      <ul className="cl-rooms">
        {rooms.map((r) => {
          const d = r.value - target;
          return (
            <li key={r.room.id}>
              <button className="cl-room" onClick={() => { const s = useStore.getState(); s.setView("live"); s.setFocusRoom(r.room.id); }} aria-label={`${r.room.name} ${fmt(r.value)} degrees, ${d >= 0 ? "+" : ""}${fmt(d)} from target. Focus room`}>
                <span>{r.room.name}</span>
                <Sparkline line={trends[r.entity]} />
                <b className="t-val">{`${fmt(r.value)} C`}</b>
                <small className={Math.abs(d) < 0.5 ? "ok" : d > 0 ? "hot" : "cold"}>{`${d >= 0 ? "+" : "-"}${Math.abs(d).toFixed(1)}`}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
