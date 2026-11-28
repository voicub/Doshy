"use client";
import { LinkBreakIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { isActive, type HAState } from "@/lib/ha";
import { stateText, type Candidate } from "@/lib/entitySuggest";
import { useAreas } from "@/lib/haAreas";
import { useStore } from "@/lib/store";
import { useVp } from "@/lib/useVp";
import type { Family } from "@/lib/running";
import EntityPickerFull from "./EntityPickerFull";
import MonoLabel from "./MonoLabel";
import WashLinkGroup from "./WashLinkGroup";
import PressureLinkGroup from "./PressureLinkGroup";

const MAX_OPTIONS = 40;
const NO_AREAS: readonly string[] = [];

type Option = { id: string; name: string; area: string | null; first: boolean };

const areaLabel = (entityArea: Record<string, string | null>, names: Record<string, string>, id: string) => {
  const a = entityArea[id];
  return a ? (names[a] ?? a) : null;
};

/** Loads the Home Assistant areas once and names each entity's area. */
function useAreaNames() {
  const { areas, entityArea, load } = useAreas();
  useEffect(() => {
    void load();
  }, [load]);
  const areaName = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a.name])), [areas]);
  return { entityArea, areaName };
}

type PickerProps = {
  label: string; value?: string; onChange: (v?: string) => void; domains: readonly string[]; preferAreas?: readonly string[];
  /** Domains that suit the item, best first (compact screens rank them first). */
  fit?: readonly string[];
  /** Extra test an entity must pass (e.g. only power sensors). */
  filter?: (st: HAState) => boolean;
  /** Washers, dryers, dishwashers and other appliances: list the WashData appliances first, one tap to link. `family` puts the matching kind on top. The domain list is unchanged. */
  wash?: { family?: Family };
};

/** Compact screens: a big "linked to" row with Choose / Unlink buttons; Choose opens the entity list as a full-screen page (EntityPickerFull). */
function TinyPicker({ label, value, onChange, domains, preferAreas, fit, filter }: PickerProps) {
  const states = useStore((s) => s.states);
  const haError = useStore((s) => s.haError);
  const { entityArea, areaName } = useAreaNames();
  const [open, setOpen] = useState(false);
  const cands = useMemo<Candidate[]>(
    () => Object.values(states)
      .filter((e) => domains.includes(e.entity_id.split(".")[0]) && (!filter || filter(e)))
      .map((e) => ({ id: e.entity_id, name: e.attributes.friendly_name ?? e.entity_id, area: areaLabel(entityArea, areaName, e.entity_id), areaId: entityArea[e.entity_id] ?? null })),
    [states, domains, filter, entityArea, areaName],
  );
  const current = value ? states[value] : undefined;
  const loading = !haError && Object.keys(states).length === 0;
  return (
    <div className="field entity-pick ep-field">
      <MonoLabel>{label}</MonoLabel>
      <div className={`ep-current ${value ? "" : "none"}`}>
        {value ? (
          <>
            <span className="ep-main">
              <b>{current?.attributes.friendly_name ?? value}</b>
              <small>{value}{value && areaLabel(entityArea, areaName, value) ? ` / ${areaLabel(entityArea, areaName, value)}` : ""}</small>
            </span>
            <span className={`ep-state ${current ? (isActive(current) ? "on" : "") : "bad"}`}>{current ? stateText(current) : "not found"}</span>
          </>
        ) : (
          <span className="ep-main"><b>Not linked yet</b></span>
        )}
      </div>
      <div className="ep-btns">
        <button type="button" className="btn ep-choose" onClick={() => setOpen(true)}>
          <MagnifyingGlassIcon size={16} aria-hidden /> {value ? "Change entity" : "Choose entity"}
        </button>
        {value && (
          <button type="button" className="btn" onClick={() => onChange(undefined)} aria-label={`Unlink ${label.toLowerCase()}`}>
            <LinkBreakIcon size={16} aria-hidden /> Unlink
          </button>
        )}
      </div>
      {haError && <small className="field-note warn">Home Assistant unreachable. Entity list unavailable.</small>}
      {open && (
        <EntityPickerFull
          label={label}
          cands={cands}
          states={states}
          value={value}
          fit={fit ?? domains}
          prefer={preferAreas ?? NO_AREAS}
          note={haError ? "Home Assistant offline." : loading ? "Linking Home Assistant" : undefined}
          onPick={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Searchable Home Assistant entity picker. Lists only the given domains, matches id, friendly name and area name,
 * labels each entity with its HA area, and puts entities of `preferAreas` (the current room) first.
 * Compact screens get a big row with Choose / Unlink and a full-screen list instead of the dropdown.
 */
export default function EntityPicker(props: PickerProps) {
  const tiny = useVp().vp !== "regular";
  return (
    <>
      {props.wash && <WashLinkGroup value={props.value} family={props.wash.family} onPick={props.onChange} />}
      <PressureLinkGroup value={props.value} domains={props.domains} filter={props.filter} onPick={props.onChange} />
      {tiny ? <TinyPicker {...props} /> : <DesktopPicker {...props} />}
    </>
  );
}

type OptionQuery = { states: Record<string, HAState>; domains: readonly string[]; filter?: (st: HAState) => boolean; query: string; preferAreas?: readonly string[]; entityArea: Record<string, string | null>; areaName: Record<string, string> };

/** The entities that match the search, `preferAreas` first, cut to MAX_OPTIONS (`total` is the count before the cut). */
function useOptions({ states, domains, filter, query, preferAreas, entityArea, areaName }: OptionQuery) {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    const prefer = new Set(preferAreas);
    const all: Option[] = Object.values(states)
      .filter((e) => domains.includes(e.entity_id.split(".")[0]) && (!filter || filter(e)))
      .map((e) => ({ id: e.entity_id, name: e.attributes.friendly_name ?? e.entity_id, area: areaLabel(entityArea, areaName, e.entity_id), first: prefer.has(entityArea[e.entity_id] ?? "") }))
      .filter((o) => !q || o.id.toLowerCase().includes(q) || o.name.toLowerCase().includes(q) || (o.area ?? "").toLowerCase().includes(q))
      .sort((a, b) => Number(b.first) - Number(a.first) || a.name.localeCompare(b.name));
    return { shown: all.slice(0, MAX_OPTIONS), total: all.length };
  }, [states, domains, query, preferAreas, entityArea, areaName, filter]);
}

/** The dropdown of the desktop picker. */
function OptionList({ id, uid, label, shown, total, active, loading, onActive, onPick }: { id: string; uid: string; label: string; shown: Option[]; total: number; active: number; loading: boolean; onActive: (i: number) => void; onPick: (entity: string) => void }) {
  return (
    <ul id={id} className="entity-list" role="listbox" aria-label={label}>
      {shown.map((o, i) => (
        <li key={o.id} id={`${uid}-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); onPick(o.id); }} onMouseMove={() => onActive(i)}>
          <span>{o.name}</span>
          <small>{o.id}</small>
          {o.area && <em className={o.first ? "here" : undefined}>{o.area}</em>}
        </li>
      ))}
      {!shown.length && <li className="entity-empty" role="presentation">{loading ? "Loading entities" : "No matching entities"}</li>}
      {total > shown.length && <li className="entity-empty" role="presentation">{total - shown.length} more. Keep typing to narrow down.</li>}
    </ul>
  );
}

function DesktopPicker({ label, value, onChange, domains, preferAreas, filter }: PickerProps) {
  const states = useStore((s) => s.states);
  const haError = useStore((s) => s.haError);
  const { entityArea, areaName } = useAreaNames();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const uid = useId();
  const loading = !haError && Object.keys(states).length === 0;
  const { shown, total } = useOptions({ states, domains, filter, query, preferAreas, entityArea, areaName });

  const pick = (id?: string) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(shown.length - 1, Math.max(0, a + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && open && shown[active]) {
      e.preventDefault();
      pick(shown[active].id);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const current = value ? states[value] : undefined;
  const currentArea = value ? areaLabel(entityArea, areaName, value) : null;
  const listId = `${uid}-list`;

  return (
    <div className="field entity-pick">
      <MonoLabel>{label}</MonoLabel>
      {value && (
        <div className="entity-current">
          <span>
            <b>{current?.attributes.friendly_name ?? value}</b>
            <small>{value}{currentArea ? ` / ${currentArea}` : ""}</small>
          </span>
          <button type="button" className="icon-btn" aria-label={`Unlink ${label.toLowerCase()}`} onClick={() => pick(undefined)}>
            <XIcon size={12} />
          </button>
        </div>
      )}
      <input
        role="combobox"
        aria-label={`Search ${label.toLowerCase()}`}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && shown[active] ? `${uid}-${active}` : undefined}
        aria-autocomplete="list"
        value={query}
        placeholder={haError ? "Home Assistant offline" : loading ? "Linking Home Assistant" : value ? "Change entity" : "Search by name, id or area"}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
      />
      {open && <OptionList id={listId} uid={uid} label={label} shown={shown} total={total} active={active} loading={loading} onActive={setActive} onPick={pick} />}
      {haError && <small className="field-note warn">Home Assistant unreachable. Entity list unavailable.</small>}
      {!haError && !loading && value && <small className={`field-note ${current ? "ok" : "warn"}`}>{current ? stateText(current) : "Entity not found"}</small>}
    </div>
  );
}
