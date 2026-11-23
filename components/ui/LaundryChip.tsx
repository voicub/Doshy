"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { glanceOf, isWashLike, washdataOf, washView, WASH_COLOR, type Glance, type WashKind } from "@/lib/washdata";
import { DEVICE_EVENT } from "./serviceActions";
import { WASH_ICON } from "./washIcons";
import "./washData.css";

type Item = Glance & { kind: WashKind };

/** Washers, dryers and dishwashers on the plan that are running or waiting to be emptied, laundry waiting first. One entry per WashData device. */
function useLaundry(): Item[] {
  const items = useStore((s) => s.plan.items);
  const states = useStore((s) => (s.plan.items.some((i) => isWashLike(i.entity)) ? s.states : undefined));
  return useMemo(() => {
    if (!states) return [];
    const seen = new Set<string>();
    const out: Item[] = [];
    for (const it of items) {
      const dev = washdataOf(states, it.entity);
      if (!dev || seen.has(dev.base)) continue;
      seen.add(dev.base);
      const g = glanceOf(washView(states, dev.base), dev.anchor);
      if (g) out.push({ ...g, kind: dev.kind });
    }
    return out.sort((a, b) => Number(b.tone === "done") - Number(a.tone === "done"));
  }, [items, states]);
}

const openCard = (entity: string, e: { currentTarget: HTMLElement }) => {
  const r = e.currentTarget.getBoundingClientRect();
  window.dispatchEvent(new CustomEvent(DEVICE_EVENT, { detail: { entity, x: r.left, y: r.bottom } }));
};

/** The glance chip: "Washer 32 min", "Dishwasher done". Tap opens the appliance card. `max` chips at most; the rest show as "+n". */
export default function LaundryChip({ max = 2 }: { max?: number }) {
  const list = useLaundry();
  if (!list.length) return null;
  const shown = list.slice(0, max);
  const more = list.length - shown.length;
  return (
    <>
      {shown.map((g, i) => {
        const Icon = WASH_ICON[g.kind];
        return (
          <button key={g.entity} type="button" className={`t-btn lc${g.tone === "done" ? " attention" : ""}`} style={{ ["--sc" as string]: WASH_COLOR[g.tone] }} aria-label={`${g.text}. Open the appliance card`} onClick={(e) => openCard(g.entity, e)}>
            <Icon size={16} aria-hidden />
            <span>{g.text}{more > 0 && i === shown.length - 1 ? ` +${more}` : ""}</span>
          </button>
        );
      })}
    </>
  );
}

/** The house card's row: every appliance with news, one tappable line each. */
export function LaundryRow() {
  const list = useLaundry();
  if (!list.length) return null;
  return (
    <div className="lc-row" role="list" aria-label="Laundry and dishes">
      {list.map((g) => {
        const Icon = WASH_ICON[g.kind];
        return (
          <button key={g.entity} type="button" role="listitem" className={`lc${g.tone === "done" ? " attention" : ""}`} style={{ ["--sc" as string]: WASH_COLOR[g.tone] }} aria-label={`${g.text}. Open the appliance card`} onClick={(e) => openCard(g.entity, e)}>
            <Icon size={16} aria-hidden />
            <span>{g.text}</span>
          </button>
        );
      })}
    </div>
  );
}
