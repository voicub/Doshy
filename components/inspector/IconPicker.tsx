"use client";
import { useMemo, useState } from "react";
import { DEVICE_ICONS, iconLabel, iconOf, searchIcons, withIcon } from "@/lib/deviceIcons";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { iconComponent, type IconComponent } from "../ui/deviceIcons";
import { Group } from "./shared";
import "./iconPicker.css";

/** "Icon": the small round marker over a linked device. Automatic follows the kind of Home Assistant entity; any other choice is kept with the plan. */
export default function IconPicker({ item, fallback: Fallback }: { item: Item; fallback: IconComponent | undefined }) {
  const patch = useStore((s) => s.patch);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = iconOf(item.params);
  const list = useMemo(() => searchIcons(q), [q]);
  const Now = iconComponent(current) ?? Fallback;
  const choose = (id: string | undefined) => {
    patch("item", item.id, { params: withIcon(item.params, id) });
    setOpen(false);
    setQ("");
  };
  return (
    <Group label="Icon">
      <div className="ip-row">
        <span className="ip-now" aria-hidden>{Now && <Now size={20} />}</span>
        <span className="ip-name">{current ? iconLabel(current) : "Automatic"}</span>
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Choose icon"}</button>
      </div>
      {open && (
        <div className="ip-panel">
          <input type="search" className="ip-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: lamp, fan, door..." aria-label="Search icons" autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" />
          <div className="ip-grid" role="listbox" aria-label="Icons">
            {!q && (
              <button type="button" role="option" aria-selected={!current} className="ip-cell ip-auto" onClick={() => choose(undefined)} title="Follows the kind of device">
                <span className="ip-glyph">{Fallback && <Fallback size={22} />}</span>
                <span>Automatic</span>
              </button>
            )}
            {list.map((i) => {
              const C = iconComponent(i.id);
              return (
                <button key={i.id} type="button" role="option" aria-selected={current === i.id} className="ip-cell" onClick={() => choose(i.id)} title={i.label}>
                  <span className="ip-glyph">{C && <C size={22} />}</span>
                  <span>{i.label}</span>
                </button>
              );
            })}
            {!list.length && <p className="field-note">No icon matches that. Try another word.</p>}
          </div>
          <small className="field-note">{DEVICE_ICONS.length} icons. The choice is saved with your plan.</small>
        </div>
      )}
    </Group>
  );
}
