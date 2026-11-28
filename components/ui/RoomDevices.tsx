"use client";
import { InfoIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState, type PointerEvent } from "react";
import { useItemFocus } from "@/components/scene/itemFocus";
import { deviceRows, filterRows, groupRows, TYPE_TITLE, DEVICE_TYPES, zoneDeviceRows, type DeviceRow, type DeviceType } from "@/lib/roomDevices";
import { useStore } from "@/lib/store";
import type { Room } from "@/lib/types";
import { isolationOf, type Zone } from "@/lib/roomIsolate";
import HudPanel from "./HudPanel";
import PinnedScenes from "./PinnedScenes";
import { useRoomSheet } from "./roomSheetStore";
import { DEVICE_EVENT } from "./serviceActions";
import { WASH_ICON } from "./washIcons";
import DeviceGlyph from "./DeviceGlyph";
import "./washData.css";
import "./roomDevices.css";

const EMPTY = "No linked devices in this room yet. Link furniture in Home Assistant mode.";

/** The room's linked devices as a touch-friendly sheet; rows point at their item in 3D, toggles act only on a tap. */
export default function RoomDevices() {
  const roomId = useRoomSheet((s) => s.room);
  const isolated = useStore((s) => s.isolatedRoom);
  const zone = useStore(isolationOf);
  const room = useStore((s) => s.plan.rooms.find((r) => r.id === (zone ? isolated : roomId)));
  return room ? <Sheet key={`${room.id}${zone ? "-room" : ""}`} room={room} zone={zone} /> : null;
}

/** `zone`: Room mode, the list is docked beside the room and holds everything in its footprint; closing leaves Room mode. */
function Sheet({ room, zone }: { room: Room; zone?: Zone }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const closeSheet = useRoomSheet((s) => s.close);
  const setIsolatedRoom = useStore((s) => s.setIsolatedRoom);
  const isDocked = !!zone;
  const close = useCallback(() => (isDocked ? setIsolatedRoom(null) : closeSheet()), [isDocked, closeSheet, setIsolatedRoom]);
  const [q, setQ] = useState("");
  const [type, setType] = useState<DeviceType | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      useItemFocus.getState().setHover(null);
    };
  }, [close]);

  const rows = useMemo(() => (zone ? zoneDeviceRows(plan, states, zone) : deviceRows(plan, states, room)), [plan, states, room, zone]);
  const counts = useMemo(() => DEVICE_TYPES.map((t) => [t, rows.filter((r) => r.type === t).length] as const).filter(([, n]) => n), [rows]);
  const groups = useMemo(() => groupRows(filterRows(rows, q, type)), [rows, q, type]);
  const shown = groups.reduce((n, g) => n + g.rows.length, 0);
  const name = zone ? zone.hosts.map((id) => plan.rooms.find((r) => r.id === id)?.name ?? id).join(" + ") : room.name;

  return (
    <HudPanel title="Devices" meta={`${name} · ${rows.length}`} onClose={close} className={zone ? "rd rd-dock sheet" : "rd sheet"}>
      <PinnedScenes roomId={room.id} />
      {rows.length === 0 ? (
        <p className="rd-empty">{EMPTY}</p>
      ) : (
        <>
          <label className="search">
            <MagnifyingGlassIcon size={14} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search devices" aria-label={`Search devices in ${room.name}`} spellCheck={false} autoComplete="off" />
          </label>
          {counts.length > 1 && (
            <div className="eb-chips" role="group" aria-label="Device type">
              <button className="eb-chip" aria-pressed={type === null} onClick={() => setType(null)}>All {rows.length}</button>
              {counts.map(([t, n]) => (
                <button key={t} className="eb-chip" aria-pressed={type === t} onClick={() => setType(type === t ? null : t)}>{TYPE_TITLE[t]} {n}</button>
              ))}
            </div>
          )}
          <div className="rd-list" aria-live="polite">
            {shown === 0 && <p className="rd-empty">Nothing matches that search.</p>}
            {groups.map((g) => (
              <section key={g.type} aria-label={g.title}>
                <h3 className="rd-group">{g.title}<span>{g.rows.length}</span></h3>
                <ul>{g.rows.map((r) => <Row key={`${r.itemId}${r.layer ?? ""}`} row={r} />)}</ul>
              </section>
            ))}
          </div>
        </>
      )}
    </HudPanel>
  );
}

/** The appliance icon of a WashData row. */
function Kind({ kind }: { kind: NonNullable<DeviceRow["wash"]> }) {
  const Icon = WASH_ICON[kind];
  return <Icon size={16} aria-hidden />;
}

function Row({ row: r }: { row: DeviceRow }) {
  const point = () => { const f = useItemFocus.getState(); f.setHover(r.itemId); f.pulseItem(r.itemId); };
  const leave = () => useItemFocus.getState().setHover(null);
  const details = (x?: number, y?: number) => window.dispatchEvent(new CustomEvent(DEVICE_EVENT, { detail: { entity: r.entity, x, y } }));
  return (
    <li
      className="rd-row"
      data-alert={r.alert ? "" : undefined}
      onPointerEnter={(e: PointerEvent) => e.pointerType !== "touch" && point()}
      onPointerLeave={leave}
      onFocus={point}
      onBlur={leave}
      onContextMenu={(e) => { e.preventDefault(); details(e.clientX, e.clientY); }}
    >
      <button className="rd-main" onClick={() => useItemFocus.getState().frameItem(r.itemId)} aria-label={`${r.name}, ${r.value}${r.alert ? ", needs attention" : ""}. Show in the home`}>
        <span className="rd-name"><DeviceGlyph itemId={r.itemId} entity={r.entity} className="rd-kind" fallback={r.wash ? <Kind kind={r.wash} /> : undefined} />{r.name}</span>
        <span className={`rd-val ${r.on ? "on" : ""}`}>{r.value}</span>
      </button>
      {r.toggleable && (
        <button role="switch" aria-checked={r.on} aria-label={r.entity.startsWith("cover.") ? `${r.name} open` : `${r.name} power`} className="rd-sw" onClick={() => void useStore.getState().toggle(r.entity)}>
          <i />
        </button>
      )}
      <button className="rd-info" aria-label={`Details for ${r.name}`} onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); details(b.left, b.bottom); }}>
        <InfoIcon size={14} />
      </button>
    </li>
  );
}
