"use client";
import { CaretDownIcon, CaretRightIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { domainOf, isActive, TOGGLEABLE, type HAState } from "@/lib/ha";
import { stateText } from "@/lib/entitySuggest";
import { autoAreaIds, type HaArea } from "@/lib/haAreas";
import { useStore } from "@/lib/store";
import type { Plan, Room, Sel } from "@/lib/types";
import { CHIPS, nameOf, linkTarget, type Group } from "./entityBrowserModel";
import { DEVICE_EVENT } from "./serviceActions";

/** Search box, domain chips (plus the bulk-map button on compact screens), the bulk button on wide ones, and the areas loading / error note. */
export function BrowserToolbar({ q, onQuery, chips, onChips, diag, onDiag, tiny, bulk, error, loaded, onRetry }: { q: string; onQuery: (q: string) => void; chips: string[]; onChips: (next: string[]) => void; diag: boolean; onDiag: (on: boolean) => void; tiny: boolean; bulk: ReactNode; error: string | null; loaded: boolean; onRetry: () => void }) {
  return (
    <>
      <label className="search">
        <MagnifyingGlassIcon size={14} />
        <input value={q} onChange={(e) => onQuery(e.target.value)} placeholder="Search name or entity id" aria-label="Search entities" autoFocus={!tiny} enterKeyHint="search" spellCheck={false} autoComplete="off" />
      </label>
      <div className="eb-chips" role="group" aria-label={tiny && bulk ? "Filters and actions" : "Domain filter"}>
        {tiny && bulk}
        {CHIPS.map((c) => (
          <button key={c} className="eb-chip" aria-pressed={chips.includes(c)} onClick={() => onChips(chips.includes(c) ? chips.filter((x) => x !== c) : [...chips, c])}>{c.replace("_", " ")}</button>
        ))}
        <button className="eb-chip diag" aria-pressed={diag} onClick={() => onDiag(!diag)}>Diagnostics</button>
      </div>
      {!tiny && bulk && <div className="eb-bulk">{bulk}</div>}
      {(error || !loaded) && (
        <p className={`field-note ${error ? "warn" : ""}`} role={error ? "alert" : "status"}>
          {error ? `Areas unavailable: ${error}` : "Loading areas"}
          {error && <button className="eb-act" onClick={onRetry}>Retry</button>}
        </p>
      )}
    </>
  );
}

/** One room / area heading: expand toggle, counts, and the room actions. */
export function GroupHead({ g, collapsed, room, top, height, searching, onToggle, onMap }: { g: Group; collapsed: boolean; room: Room | undefined; top: number; height: number; searching: boolean; onToggle: () => void; onMap: (roomId: string) => void }) {
  return (
    <div className="eb-head" style={{ top, height }} role="listitem">
      <button className="eb-twist" aria-expanded={!collapsed} disabled={searching} onClick={onToggle}>
        {collapsed ? <CaretRightIcon size={12} /> : <CaretDownIcon size={12} />}
        <span className="eb-gname">{g.label}</span>
        <span className="eb-count">{g.shown.length === g.all.length ? g.all.length : `${g.shown.length}/${g.all.length}`}</span>
        {g.on > 0 && <span className="eb-on">{`${g.on} on`}</span>}
      </button>
      {room ? (
        <>
          <button className="eb-act" onClick={() => onMap(room.id)} aria-label={`Map Home Assistant areas to ${room.name}`}>{room.areas ? `Map ${room.areas.length}` : "Map auto"}</button>
          <button className="eb-act" onClick={() => useStore.getState().setFocusRoom(room.id)} aria-label={`Focus ${room.name}`}>Focus</button>
        </>
      ) : (
        <span className="eb-tag">{g.tag}</span>
      )}
    </div>
  );
}

type EntityRowProps = {
  id: string;
  room: Room | undefined;
  top: number;
  height: number;
  tiny: boolean;
  isOpen: boolean;
  isArmed: boolean;
  editing: boolean;
  plan: Plan;
  states: Record<string, HAState>;
  sel: Sel;
  onToggleOpen: () => void;
  setArmed: (id: string | null) => void;
  onPlace: (room: Room, entityId: string) => void;
};

/** The buttons of one entity: open its card, place / link it (Home Assistant mode) and the two-step switch. */
function EntityActions({ id, room, isArmed, editing, plan, states, sel, setArmed, onPlace }: Pick<EntityRowProps, "id" | "room" | "isArmed" | "editing" | "plan" | "states" | "sel" | "setArmed" | "onPlace">) {
  const name = nameOf(id, states);
  const link = editing && !isArmed ? linkTarget(sel, plan, id, states[id]) : null;
  return (
    <>
      <button className="eb-act" onClick={() => window.dispatchEvent(new CustomEvent(DEVICE_EVENT, { detail: { entity: id } }))} aria-label={`Open device card for ${name}`}>Card</button>
      {editing && room && !isArmed && <button className="eb-act" onClick={() => onPlace(room, id)} aria-label={`Place ${name} in ${room.name}`}>Place</button>}
      {link && (
        <button className="eb-act" disabled={link.current} onClick={link.apply} aria-label={`Link ${name} to the selection`}>{link.current ? "Linked" : "Link"}</button>
      )}
      {TOGGLEABLE.includes(domainOf(id)) &&
        (isArmed ? (
          <>
            <button className="eb-act armed" onClick={() => { setArmed(null); void useStore.getState().toggle(id); }} aria-label={`Switch ${name} now`}>Switch</button>
            <button className="eb-act" onClick={() => setArmed(null)}>Cancel</button>
          </>
        ) : (
          <button className="eb-act" onClick={() => setArmed(id)} aria-label={`Arm ${name} for switching`}>Arm</button>
        ))}
    </>
  );
}

export function EntityRow(p: EntityRowProps) {
  const { id, top, height, tiny, isOpen, states } = p;
  const st = states[id];
  const bad = st?.state === "unavailable" || st?.state === "unknown";
  const name = nameOf(id, states);
  const actions = <EntityActions {...p} />;
  const stateEl = st && <span className={`eb-state ${isActive(st) ? "on" : bad ? "bad" : ""}`}>{stateText(st)}</span>;
  if (tiny) {
    // a finger: the whole row is one big tap target that unfolds its buttons (no tiny buttons crammed beside the name)
    const open = isOpen;
    return (
      <div className="eb-ent eb-ent-tiny" style={{ top, height }} role="listitem">
        <button type="button" className="eb-tap" aria-expanded={open} onClick={p.onToggleOpen}>
          <span className="eb-l"><span className="eb-name">{name}</span>{stateEl}</span>
          <span className="eb-l"><span className="eb-id">{id}</span></span>
        </button>
        {open && <div className="eb-acts">{actions}</div>}
      </div>
    );
  }
  return (
    <div className="eb-ent" style={{ top, height }} role="listitem">
      <div className="eb-l">
        <span className="eb-name" title={name}>{name}</span>
        {stateEl}
      </div>
      <div className="eb-l">
        <span className="eb-id" title={id}>{id}</span>
        {actions}
      </div>
    </div>
  );
}

/** Choose which Home Assistant areas feed a room. Untouched rooms use the name match ("auto"). */
export function MapSheet({ room, areas, entityArea, onDone }: { room: Room; areas: HaArea[]; entityArea: Record<string, string | null>; onDone: () => void }) {
  const current = room.areas ?? autoAreaIds(room, areas);
  const counts: Record<string, number> = {};
  for (const a of Object.values(entityArea)) if (a) counts[a] = (counts[a] ?? 0) + 1;
  const set = (areasNext: string[] | undefined) => useStore.getState().patch("room", room.id, { areas: areasNext });

  return (
    <div className="eb-map">
      <div className="eb-map-head">
        <span className="label">{`Areas for ${room.name}`}</span>
        <button className="eb-chip" aria-pressed={!room.areas} onClick={() => set(undefined)}>Auto</button>
        <button className="eb-act" onClick={onDone}>Done</button>
      </div>
      <p className="field-note">{room.areas ? "Chosen areas. Pick Auto to match by room name." : "Auto: areas whose name matches the room name."}</p>
      <div className="eb-map-list" role="group" aria-label="Home Assistant areas">
        {areas.map((a) => {
          const on = current.includes(a.id);
          return (
            <button key={a.id} className="eb-area" role="checkbox" aria-checked={on} onClick={() => set(on ? current.filter((x) => x !== a.id) : [...current, a.id])}>
              <i aria-hidden />
              <span>{a.name}</span>
              <small>{`${counts[a.id] ?? 0}`}</small>
            </button>
          );
        })}
        {!areas.length && <p className="empty">No areas loaded.</p>}
      </div>
    </div>
  );
}