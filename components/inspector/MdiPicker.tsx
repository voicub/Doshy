"use client";
import { useEffect, useState } from "react";
import { mdiOf } from "@/lib/deviceIcons";
import { MAX_PLAN_ICONS, mdiRef, searchTerm, type MdiIcon } from "@/lib/mdi";
import { MDI_CATEGORIES } from "@/lib/mdiCategories";
import { withItemIcon } from "@/lib/mdiPlan";
import { searchMdi, useIconSettings, useMdiIcon, useMdiIcons } from "@/lib/mdiStore";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import MdiGlyph from "../ui/MdiGlyph";
import "./mdiPicker.css";

const SEARCH_DELAY_MS = 300;
const words = (name: string) => name.replace(/-/g, " ");

/** One icon of the grid. It can be picked once its drawing has arrived (a plan keeps what is picked, so it needs the drawing). */
function Cell({ name, selected, onPick }: { name: string; selected: boolean; onPick: (name: string, icon: MdiIcon) => void }) {
  const icon = useMdiIcon(name);
  return (
    <button type="button" role="option" aria-selected={selected} className="ip-cell" disabled={!icon} aria-busy={!icon} onClick={() => icon && onPick(name, icon)} title={words(name)}>
      <span className="ip-glyph">{icon && <MdiGlyph icon={icon} size={22} />}</span>
      <span>{words(name)}</span>
    </button>
  );
}

type Found = { term: string; names: string[] } | { term: string; error: string };

/** The "Home Assistant (MDI)" tab of the icon picker: the Material Design Icons Home Assistant uses, with search, ready-made groups and the ones used lately. */
export default function MdiPicker({ item, onChosen }: { item: Item; onChosen: () => void }) {
  const editPlan = useStore((s) => s.editPlan);
  const recent = useIconSettings((s) => s.recent);
  const remember = useIconSettings((s) => s.remember);
  const problem = useMdiIcons((s) => s.problem);
  const current = mdiOf(item.params);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState(MDI_CATEGORIES[0].id);
  const [found, setFound] = useState<Found | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const term = searchTerm(q);

  useEffect(() => {
    if (!term) return;
    const stop = new AbortController();
    const timer = setTimeout(() => {
      searchMdi(term, stop.signal).then(
        (names) => setFound({ term, names }),
        (e: unknown) => !stop.signal.aborted && setFound({ term, error: e instanceof Error ? e.message : "Icons could not be searched right now." }),
      );
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  }, [term]);

  const pick = (name: string, icon: MdiIcon) => {
    const plan = useStore.getState().plan;
    const next = withItemIcon(plan, item.id, mdiRef(name), icon);
    if (next === plan && mdiOf(item.params) !== name) {
      setPickError(`A plan can carry ${MAX_PLAN_ICONS} different icons. Clear an unused choice first, or reuse an icon already in this plan.`);
      return;
    }
    editPlan(() => next);
    remember(name);
    onChosen();
  };
  const shown = term ? (found?.term === term ? found : null) : null;
  const names = term ? (shown && "names" in shown ? shown.names : []) : (MDI_CATEGORIES.find((c) => c.id === group)?.names ?? []);
  const message = shown && "error" in shown ? shown.error : problem === "off" ? "Downloads from the internet are switched off on this server (DOSHY_EXTERNAL_DATA=0), so new icons cannot be fetched. Icons you already used still work." : problem === "offline" ? "The icon service cannot be reached right now. Icons you already used still work." : null;

  return (
    <div className="ip-mdi">
      <input type="search" className="ip-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all icons: lamp, door, solar..." aria-label="Search Material Design icons" autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" />
      {!term && recent.length > 0 && (
        <>
          <span className="label">Used lately</span>
          <div className="ip-grid ip-recent" role="listbox" aria-label="Icons used lately">
            {recent.slice(0, 8).map((n) => <Cell key={n} name={n} selected={current === n} onPick={pick} />)}
          </div>
        </>
      )}
      {!term && (
        <div className="ip-groups" role="group" aria-label="Icon groups">
          {MDI_CATEGORIES.map((c) => <button key={c.id} type="button" className="eb-chip" aria-pressed={group === c.id} onClick={() => setGroup(c.id)}>{c.label}</button>)}
        </div>
      )}
      <div className="ip-grid" role="listbox" aria-label={term ? "Search results" : "Icons"} aria-live="polite">
        {names.map((n) => <Cell key={n} name={n} selected={current === n} onPick={pick} />)}
        {term && shown && "names" in shown && !shown.names.length && <p className="field-note">No icon matches that. Try another word.</p>}
        {term && !shown && <p className="field-note">Searching...</p>}
      </div>
      {message && <p className="field-note" role="status">{message}</p>}
      {pickError && <p className="field-note" role="status">{pickError}</p>}
      <small className="field-note">Material Design Icons by Pictogrammers (Apache 2.0): the icons Home Assistant uses. The one you pick is saved with your plan.</small>
    </div>
  );
}
