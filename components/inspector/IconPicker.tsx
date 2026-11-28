"use client";
import { useMemo, useState } from "react";
import { DEVICE_ICONS, iconLabel, iconOf, mdiOf, searchIcons } from "@/lib/deviceIcons";
import { withItemIcon } from "@/lib/mdiPlan";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { iconComponent, type IconComponent } from "../ui/deviceIcons";
import MdiGlyph from "../ui/MdiGlyph";
import Segmented from "../ui/Segmented";
import { useItemIcon } from "../ui/useItemIcon";
import MdiPicker from "./MdiPicker";
import { Group } from "./shared";
import "./iconPicker.css";

type Tab = "doshy" | "mdi";
const TAB_LABEL: Record<Tab, string> = { doshy: "Doshy icons", mdi: "Home Assistant (MDI)" };

/**
 * "Icon": the small round marker over a linked device. Automatic follows Home Assistant (the entity's own icon or a default for its kind) or Doshy's own, as set in Display;
 * any other choice, one of Doshy's icons or a Material Design icon, is kept with the plan and always wins.
 */
export default function IconPicker({ item, fallback: Fallback }: { item: Item; fallback: IconComponent | undefined }) {
  const editPlan = useStore((s) => s.editPlan);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (mdiOf(item.params) ? "mdi" : "doshy"));
  const [q, setQ] = useState("");
  const current = iconOf(item.params);
  const picked = mdiOf(item.params);
  const mdi = useItemIcon(item); // the picked Material Design icon, or the automatic one from Home Assistant
  const list = useMemo(() => searchIcons(q), [q]);
  const Now = iconComponent(current) ?? (mdi ? undefined : Fallback);
  const choose = (id: string | undefined) => {
    editPlan((p) => withItemIcon(p, item.id, id, undefined));
    setOpen(false);
    setQ("");
  };
  return (
    <Group label="Icon">
      <div className="ip-row">
        <span className="ip-now" aria-hidden>{Now ? <Now size={20} /> : mdi && <MdiGlyph icon={mdi} size={20} />}</span>
        <span className="ip-name">{current ? iconLabel(current) : picked ? picked.replace(/-/g, " ") : "Automatic"}</span>
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Choose icon"}</button>
      </div>
      {open && (
        <div className="ip-panel">
          <Segmented<Tab> label="Icon set" value={tab} options={["doshy", "mdi"]} format={(o) => TAB_LABEL[o]} onChange={setTab} className="ip-tabs" />
          {tab === "mdi" ? (
            <>
              <button type="button" className="btn" aria-pressed={!current && !picked} onClick={() => choose(undefined)}>Automatic (follow Display setting)</button>
              <MdiPicker item={item} onChosen={() => setOpen(false)} />
            </>
          ) : (
            <>
              <input type="search" className="ip-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: lamp, fan, door..." aria-label="Search icons" autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" />
              <div className="ip-grid" role="listbox" aria-label="Icons">
                {!q && (
                  <button type="button" role="option" aria-selected={!current && !picked} className="ip-cell ip-auto" onClick={() => choose(undefined)} title="Follows the kind of device">
                    <span className="ip-glyph">{mdi && !current && !picked ? <MdiGlyph icon={mdi} size={22} /> : Fallback && <Fallback size={22} />}</span>
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
            </>
          )}
        </div>
      )}
    </Group>
  );
}
