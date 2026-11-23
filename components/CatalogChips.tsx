"use client";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { CAR_BODY_TYPES } from "@/lib/cars";
import { SIZES, type SizeClass } from "@/lib/catalogSearch";

export type CatalogMode = "all" | "favs" | "recent" | "mine";
export type CatalogGroups = { id: string; label: string; cats: string[] }[];

export type CatalogFilter = { group: string; cat: string | null; body: string | null; size: SizeClass | null };

type Props = {
  modes: { id: CatalogMode; label: string }[];
  mode: CatalogMode;
  searching: boolean;
  missing: boolean;
  onMode: (m: CatalogMode) => void;
  groups: CatalogGroups;
  counts: Record<string, number>;
  filter: CatalogFilter;
  onGroup: (id: string) => void;
  onCat: (c: string | null) => void;
  onBody: (b: string | null) => void;
  onSize: (s: SizeClass | null) => void;
  /** The things that only matter sometimes (3D model credits, car tools): folded behind "More". Omitted: no More chip. */
  more?: ReactNode;
};

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" className="cc-chip" aria-pressed={on} onClick={onClick}>
    {children}
  </button>
);

type PanelProps = Pick<Props, "groups" | "counts" | "filter" | "onGroup" | "onCat" | "onBody" | "onSize"> & {
  /** Kind, category and body-type filters only apply while browsing (no search typed, mode "Browse"). */
  browse: boolean;
  /** Fold the panel away (a choice that ends the filtering). */
  close: () => void;
};

/** The open "Filters" panel: kind, category, body type and size, each a single scrolling row. */
function FilterPanel({ browse, groups, counts, filter, onGroup, onCat, onBody, onSize, close }: PanelProps) {
  const cats = groups.find((g) => g.id === filter.group)?.cats ?? [];
  return (
    <div className="cc-panel" id="cc-filters">
      {browse && (
        <>
          <span className="label">Kind of piece</span>
          <div className="cc-row" role="group" aria-label="Kind of piece">
            <Chip on={filter.group === "all"} onClick={() => onGroup("all")}>Everything</Chip>
            {groups.map((g) => (
              <Chip key={g.id} on={filter.group === g.id} onClick={() => onGroup(g.id)}>{g.label}</Chip>
            ))}
          </div>
          {filter.group !== "all" && (
            <>
              <span className="label">Category</span>
              <div className="cc-row" role="group" aria-label="Category">
                {cats.map((c) => (
                  <Chip key={c} on={filter.cat === c} onClick={() => (onCat(filter.cat === c ? null : c), c !== "Garage & EV" && close())}>
                    {c} <span className="cat-n">{counts[c] ?? 0}</span>
                  </Chip>
                ))}
              </div>
            </>
          )}
          {filter.cat === "Garage & EV" && (
            <>
              <span className="label">Body type</span>
              <div className="cc-row" role="group" aria-label="Body type">
                {CAR_BODY_TYPES.map((t) => (
                  <Chip key={t.id} on={filter.body === t.id} onClick={() => (onBody(filter.body === t.id ? null : t.id), close())}>{t.label}</Chip>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <span className="label">Size</span>
      <div className="cc-row" role="group" aria-label="Size">
        {SIZES.map((s) => (
          <Chip key={s.id} on={filter.size === s.id} onClick={() => (onSize(filter.size === s.id ? null : s.id), close())}>{s.label}</Chip>
        ))}
      </div>
    </div>
  );
}

/**
 * The catalog's filters on a compact screen: ONE scrolling row of chips (Browse, Favourites, Recent, My pieces, Filters, More) and, under
 * it, the panel of the chip that is open (each filter a single scrolling row too), so the cards always start right below.
 */
export default function CatalogChips({ modes, mode, searching, missing, onMode, groups, counts, filter, onGroup, onCat, onBody, onSize, more }: Props) {
  const [panel, setPanel] = useState<"filters" | "more" | null>(null);
  const browse = !searching && mode === "all";
  const active = (browse ? (filter.group !== "all" ? 1 : 0) + (filter.cat ? 1 : 0) + (filter.body ? 1 : 0) : 0) + (filter.size ? 1 : 0);
  const toggle = (p: "filters" | "more") => setPanel(panel === p ? null : p);

  return (
    <div className="cc">
      <div className="cc-row" role="group" aria-label="Show">
        {modes.map((m) => (
          <Chip key={m.id} on={!searching && mode === m.id} onClick={() => onMode(m.id)}>
            {m.label}
            {m.id === "mine" && missing && <i className="cc-dot" aria-label="This plan uses pieces that are not on this device" />}
          </Chip>
        ))}
        <span className="cc-sep" aria-hidden />
        <button type="button" className="cc-chip cc-fold" aria-expanded={panel === "filters"} aria-controls="cc-filters" onClick={() => toggle("filters")}>
          {active ? `Filters (${active})` : "Filters"}
          {panel === "filters" ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
        </button>
        {more && (
          <button type="button" className="cc-chip cc-fold" aria-expanded={panel === "more"} aria-controls="cc-more" onClick={() => toggle("more")}>
            More
            {panel === "more" ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
          </button>
        )}
      </div>

      {panel === "filters" && (
        <FilterPanel browse={browse} groups={groups} counts={counts} filter={filter} onGroup={onGroup} onCat={onCat} onBody={onBody} onSize={onSize} close={() => setPanel(null)} />
      )}

      {panel === "more" && more && (
        <div className="cc-panel" id="cc-more">
          {more}
        </div>
      )}
    </div>
  );
}
