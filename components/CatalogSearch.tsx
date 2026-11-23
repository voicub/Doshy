"use client";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { RefObject } from "react";

type Props = {
  value: string;
  onChange: (q: string) => void;
  /** Compact or touch screen: a "search" keyboard. */
  keyboardSearch: boolean;
  tiny: boolean;
  /** The kind being placed, if any: Esc cancels it before it closes the drawer. */
  placing: boolean;
  /** The first result: Enter starts placing it. */
  firstKind: string | undefined;
  onPlace: (kind: string) => void;
  onCancelPlace: () => void;
  onClose: () => void;
  grid: RefObject<HTMLDivElement | null>;
};

/** The catalog's search box. Esc cancels placing or closes, Enter places the first result, the down arrow moves to the cards. */
export default function CatalogSearch({ value, onChange, keyboardSearch, tiny, placing, firstKind, onPlace, onCancelPlace, onClose, grid }: Props) {
  return (
    <label className="search">
      <MagnifyingGlassIcon size={14} />
      <input
        type={keyboardSearch ? "search" : "text"}
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (placing) onCancelPlace();
            else onClose();
          } else if (e.key === "Enter" && tiny) e.currentTarget.blur(); // the keyboard's Search key: put the keyboard away, the results are right below
          else if (e.key === "Enter" && firstKind) onPlace(firstKind);
          else if (e.key === "ArrowDown") grid.current?.querySelector<HTMLElement>(".cat-main")?.focus();
        }}
        placeholder={tiny ? "Search: sofa, bed, lamp" : "Search: couch, fridge, lamp, IKEA"}
        aria-label="Search furniture"
      />
    </label>
  );
}
