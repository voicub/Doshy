"use client";
import { ArrowLeftIcon, CircleIcon, DoorOpenIcon, FanIcon, GaugeIcon, LightbulbIcon, LockIcon, MagnifyingGlassIcon, PlugIcon, SpeakerHighIcon, ThermometerIcon, type Icon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { domainOf, isActive, type HAState } from "@/lib/ha";
import { domainChips, domainLabel, loadRecent, rankEntities, rememberEntity, stateText, type Candidate } from "@/lib/entitySuggest";
import useRestoreFocus from "./useRestoreFocus";
import "./compactLink.css";

const ICONS: Record<string, Icon> = {
  light: LightbulbIcon, switch: PlugIcon, input_boolean: PlugIcon, climate: ThermometerIcon, sensor: GaugeIcon, binary_sensor: GaugeIcon,
  cover: DoorOpenIcon, fan: FanIcon, media_player: SpeakerHighIcon, lock: LockIcon,
};
const MAX_REST = 60;

type Props = {
  /** What is being chosen ("Temperature sensor"): the dialog's name. */
  label: string;
  cands: Candidate[];
  states: Record<string, HAState>;
  value?: string;
  fit: readonly string[];
  prefer: readonly string[];
  /** Why the list may be empty. */
  note?: string;
  onPick: (id: string) => void;
  onClose: () => void;
};

function Row({ c, st, on, onPick }: { c: Candidate; st?: HAState; on: boolean; onPick: (id: string) => void }) {
  const Glyph = ICONS[domainOf(c.id)] ?? CircleIcon;
  const bad = st?.state === "unavailable" || st?.state === "unknown";
  return (
    <li>
      <button type="button" className="ep-row" aria-current={on || undefined} onClick={() => onPick(c.id)}>
        <Glyph size={22} aria-hidden />
        <span className="ep-main">
          <b>{c.name}</b>
          <small>{c.id}{c.area ? ` / ${c.area}` : ""}</small>
        </span>
        {st && <span className={`ep-state ${isActive(st) ? "on" : bad ? "bad" : ""}`}>{stateText(st)}</span>}
      </button>
    </li>
  );
}

/** Compact screens: the entity list as a full-screen page. Back at the top, search beside it, domain chips, then big rows. A tap on a row picks it and closes the page. */
export default function EntityPickerFull({ label, cands, states, value, fit, prefer, note, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<string | null>(null);
  const [recent] = useState(loadRecent);
  const chips = useMemo(() => domainChips(cands, fit), [cands, fit]);
  const ranked = useMemo(() => rankEntities(cands, { prefer, fit, recent, query, domain }), [cands, prefer, fit, recent, query, domain]);
  const rest = ranked.rest.slice(0, MAX_REST);

  useRestoreFocus();

  const pick = (id: string) => {
    rememberEntity(id);
    onPick(id);
    onClose();
  };
  const none = !ranked.recent.length && !ranked.suggested.length && !rest.length;
  const section = (title: string, list: Candidate[]) =>
    list.length > 0 && (
      <section aria-label={title}>
        <h3 className="ep-sec">{title}</h3>
        <ul>{list.map((c) => <Row key={c.id} c={c} st={states[c.id]} on={c.id === value} onPick={pick} />)}</ul>
      </section>
    );

  return createPortal(
    <div
      className="ep-full"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault(); // the sheet behind listens for Esc too
        onClose();
      }}
    >
      <div className="ep-top">
        <button type="button" className="ep-back" onClick={onClose} aria-label={`Back, close ${label.toLowerCase()} list`}>
          <ArrowLeftIcon size={20} aria-hidden /> Back
        </button>
        <label className="ep-search">
          <MagnifyingGlassIcon size={18} aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, id or room" aria-label={`Search ${label.toLowerCase()}`} enterKeyHint="search" spellCheck={false} autoComplete="off" />
        </label>
      </div>
      {chips.length > 1 && (
        <div className="ep-chips" role="group" aria-label="Kind of device">
          <button type="button" className="ep-chip" aria-pressed={domain === null} onClick={() => setDomain(null)}>All</button>
          {chips.map((d) => (
            <button key={d} type="button" className="ep-chip" aria-pressed={domain === d} onClick={() => setDomain(domain === d ? null : d)}>{domainLabel(d)}</button>
          ))}
        </div>
      )}
      <div className="ep-list">
        {section("Recently used", ranked.recent)}
        {section("Suggested for this item", ranked.suggested)}
        {section(ranked.recent.length || ranked.suggested.length ? "Everything else" : "All entities", rest)}
        {ranked.rest.length > rest.length && <p className="ep-note">{ranked.rest.length - rest.length} more. Type in the search box to narrow down.</p>}
        {none && <p className="ep-note">{note ?? "Nothing matches. Try a shorter search."}</p>}
      </div>
    </div>,
    document.body,
  );
}
