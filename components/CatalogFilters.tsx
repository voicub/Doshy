"use client";
import { CAR_BODY_TYPES } from "@/lib/cars";
import { SIZES, type SizeClass } from "@/lib/catalogSearch";
import type { CatalogFilter, CatalogGroups, CatalogMode } from "./CatalogChips";

type Props = {
  modes: { id: CatalogMode; label: string }[];
  mode: CatalogMode;
  /** A search is typed: it looks across the whole catalog, so the mode and group tabs step aside. */
  needle: string;
  missing: boolean;
  onMode: (m: CatalogMode) => void;
  groups: CatalogGroups;
  counts: Record<string, number>;
  filter: CatalogFilter;
  onGroup: (id: string) => void;
  onCat: (c: string | null) => void;
  onBody: (b: string | null) => void;
  onSize: (s: SizeClass | null) => void;
};

/** The catalog's filters on a regular screen: mode buttons, kind tabs, category and body-type tabs, size tabs. (Compact screens use CatalogChips.) */
export default function CatalogFilters({ modes, mode, needle, missing, onMode, groups, counts, filter, onGroup, onCat, onBody, onSize }: Props) {
  const { group, cat, body, size } = filter;
  return (
    <div className="cat-filters">
      <div className="seg cat-modes" role="group" aria-label="Show">
        {modes.map((m) => (
          <button key={m.id} aria-pressed={!needle && mode === m.id} onClick={() => onMode(m.id)}>
            {m.label}
            {m.id === "mine" && missing && <i className="cat-dot" title="This plan uses pieces that are not on this device" />}
          </button>
        ))}
      </div>

      {!needle && mode === "all" && (
        <>
          <div className="tabs" role="group" aria-label="Kind of piece">
            <button className={group === "all" ? "tab active" : "tab"} aria-pressed={group === "all"} onClick={() => onGroup("all")}>
              Everything
            </button>
            {groups.map((g) => (
              <button key={g.id} className={group === g.id ? "tab active" : "tab"} aria-pressed={group === g.id} onClick={() => onGroup(g.id)}>
                {g.label}
              </button>
            ))}
          </div>
          {group !== "all" && (
            <div className="tabs cat-sub" role="group" aria-label="Category">
              {groups.find((g) => g.id === group)?.cats.map((c) => (
                <button key={c} className={cat === c ? "tab active" : "tab"} aria-pressed={cat === c} onClick={() => onCat(cat === c ? null : c)}>
                  {c} <span className="cat-n">{counts[c] ?? 0}</span>
                </button>
              ))}
            </div>
          )}
          {cat === "Garage & EV" && (
            <div className="tabs cat-sub" role="group" aria-label="Body type">
              {CAR_BODY_TYPES.map((t) => (
                <button key={t.id} className={body === t.id ? "tab active" : "tab"} aria-pressed={body === t.id} onClick={() => onBody(body === t.id ? null : t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="tabs cat-size" role="group" aria-label="Size">
        <span className="label">Size</span>
        {SIZES.map((s) => (
          <button key={s.id} className={size === s.id ? "tab active" : "tab"} aria-pressed={size === s.id} title={s.hint} onClick={() => onSize(size === s.id ? null : s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {needle && <p className="field-note">{`Results for "${needle}" across the whole catalog`}</p>}
    </div>
  );
}
