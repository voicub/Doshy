"use client";
import { BrowserIcon, CubeFocusIcon, ListBulletsIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import type { HAState } from "@/lib/ha";
import { fmtRh, fmtTemp, sinceLabel, type RoomLive } from "@/lib/live";
import { levelIdOf, sortedLevels } from "@/lib/levels";
import { openOpenings } from "@/lib/openings";
import { lightInfo, rgbCss } from "@/lib/light";
import { roomSummary, type RoomSummary } from "@/lib/rooms";
import { useStore } from "@/lib/store";
import { useLiveRooms } from "@/lib/useLive";
import MonoLabel from "./MonoLabel";
import { useRoomSheet } from "./roomSheetStore";
import "./RoomRail.css";
import "./live.css";
import "./roomDevices.css";
import "./roomIsolate.css";

const MAX_BARS = 8;
const FALLBACK_LIGHT = "#ffc680";

type RailRowProps = { r: RoomSummary; compact: boolean; live: RoomLive | undefined; states: Record<string, HAState>; isOpen: boolean; isFocused: boolean; isIsolated: boolean };

/** One room: focus button (name, live metrics, light bars) with the Enter-room and Devices buttons beside it. */
function RailRow({ r, compact, live: l, states, isOpen, isFocused: active, isIsolated }: RailRowProps) {
  const setFocusRoom = useStore((s) => s.setFocusRoom);
  const setIsolatedRoom = useStore((s) => s.setIsolatedRoom);
  const bars = r.lights.entities.slice(0, MAX_BARS);
  const occ = l?.presence;
  const occTip = occ == null || l?.presenceSince === undefined ? "" : `${occ ? "OCCUPIED" : "EMPTY"} ${sinceLabel(l.presenceSince, Date.now())}`;
  const watts = l?.powerW;
  const liveLabel = [
    l?.temp ? fmtTemp(l.temp) : "",
    l?.humidity ? `${fmtRh(l.humidity)} humidity` : "",
    occ == null ? "" : occ ? "occupied" : "empty",
    watts === undefined ? "" : `${Math.round(watts)} watts`,
  ].filter(Boolean).join(", ");
  return (
    <div className="rail-row">
      <button
        className={`rail-item ${active ? "active brackets" : ""}`}
        aria-pressed={active}
        aria-label={`${r.name}, ${r.lights.on} of ${r.lights.total} lights on${liveLabel ? `, ${liveLabel}` : ""}${isOpen ? ", window open" : ""}`}
        onClick={() => setFocusRoom(active ? null : r.id)}
      >
        <span className="rail-top">
          <span>{r.name}</span>
          {isOpen && <span className="rail-open" title="Window or door open"><BrowserIcon size={12} /></span>}
          {occ != null && <i className={`occ ${occ ? "on" : ""}`} title={occTip} />}
          {l?.temp && <small data-c={l.tempComfort}>{fmtTemp(l.temp)}</small>}
        </span>
        {(l?.humidity || watts !== undefined) && (
          <span className="rail-live" aria-hidden>
            <span data-c={l?.humidityComfort}>{l?.humidity ? `${fmtRh(l.humidity)} RH` : ""}</span>
            <span>{watts === undefined ? "" : `${Math.round(watts)} W`}</span>
          </span>
        )}
        {bars.length ? (
          <span className="rail-bottom" aria-hidden>
            <span className="bars">
              {bars.map((id) => {
                const info = lightInfo(states[id], FALLBACK_LIGHT);
                return <i key={id} className={info.on ? "on" : ""} style={info.on ? ({ ["--c" as string]: rgbCss(info.rgb) }) : undefined} />;
              })}
            </span>
            <small className={r.lights.on ? "lit" : ""}>{`${r.lights.on}/${r.lights.total}`}</small>
          </span>
        ) : (
          <span className="bars none" aria-hidden>--</span>
        )}
      </button>
      {!compact && (
        <button type="button" className="rail-enter" aria-pressed={isIsolated} aria-label={isIsolated ? `Leave ${r.name}` : `Enter ${r.name}`} title={isIsolated ? "Back to the whole home" : "Enter this room"} onClick={() => setIsolatedRoom(isIsolated ? null : r.id)}>
          <CubeFocusIcon size={14} />
        </button>
      )}
      <button type="button" className="rail-dev" aria-label={`Devices in ${r.name}`} title="Devices" onClick={() => useRoomSheet.getState().open(r.id)}>
        <ListBulletsIcon size={14} />
      </button>
    </div>
  );
}

/** `compact`: names, lights and the open-window glyph only (no live metrics). */
export default function RoomRail({ loading, compact = false }: { loading: boolean; compact?: boolean }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const focusRoom = useStore((s) => s.focusRoom);
  const isolated = useStore((s) => s.isolatedRoom);
  const live = useLiveRooms();
  // alcoves are part of their parent room (its summary already includes them)
  const openRooms = useMemo(() => new Set(openOpenings(plan, states).flatMap((o) => o.roomIds)), [plan, states]);
  const levels = useMemo(() => sortedLevels(plan), [plan]);
  const multi = levels.length > 1;
  const setActiveLevel = useStore((s) => s.setActiveLevel);
  const rooms = useMemo(() => {
    const list = plan.rooms.filter((r) => !r.parent).map((r) => ({ ...roomSummary(plan, states, r), level: levelIdOf(plan, r) }));
    // several levels: lowest first, plan order kept within a level
    return multi ? levels.flatMap((lv) => list.filter((r) => r.level === lv.id)) : list;
  }, [plan, states, levels, multi]);

  return (
    <nav className="rail" aria-label="Rooms" aria-busy={loading}>
      <MonoLabel className="rail-title">
        <span>Rooms</span>
        <b>{String(rooms.length).padStart(2, "0")}</b>
      </MonoLabel>
      {loading
        ? Array.from({ length: Math.min(Math.max(rooms.length, 3), 7) }, (_, i) => <div key={i} className="sk" style={{ animationDelay: `${i * 90}ms` }} />)
        : rooms.flatMap((r, i) => {
            const lv = multi && r.level !== rooms[i - 1]?.level ? levels.find((x) => x.id === r.level) : undefined;
            const header = lv ? (
              <button key={`lv-${lv.id}`} type="button" className="rail-level" onClick={() => setActiveLevel(lv.id)} title={`Show ${lv.name}`}>
                <span>{lv.name}</span>
                <small>{`${lv.elevation >= 0 ? "+" : "-"}${Math.abs(lv.elevation).toFixed(2)} M`}</small>
              </button>
            ) : null;
            const item = <RailRow key={r.id} r={r} compact={compact} live={compact ? undefined : live[r.id]} states={states} isOpen={openRooms.has(r.id)} isFocused={focusRoom === r.id} isIsolated={isolated === r.id} />;
            return header ? [header, item] : [item];
          })}
    </nav>
  );
}
