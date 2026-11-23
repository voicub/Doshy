"use client";
import { useMemo } from "react";
import { washdataOptions } from "@/lib/entitySuggest";
import type { Family } from "@/lib/running";
import { useStore } from "@/lib/store";
import { washdataOf } from "@/lib/washdata";
import MonoLabel from "./MonoLabel";
import { WASH_ICON } from "./washIcons";
import "./washData.css";

/**
 * "WashData appliances": the washing machines, dryers and dishwashers WashData reports, each with its state in words and a single tap to link the item
 * (it links the device's state sensor; any entity of the device stands for the whole device). Shows nothing when WashData has nothing to offer.
 */
export default function WashLinkGroup({ value, family, onPick }: { value?: string; family?: Family; onPick: (entity: string) => void }) {
  const states = useStore((s) => s.states);
  const options = useMemo(() => washdataOptions(states, family), [states, family]);
  const linked = washdataOf(states, value)?.anchor;
  if (!options.length) return null;
  return (
    <div className="field wd-group" role="group" aria-label="WashData appliances">
      <MonoLabel>WashData appliances</MonoLabel>
      <div className="wd-list">
        {options.map((o) => {
          const Icon = WASH_ICON[o.kind];
          return (
            <button key={o.entity} type="button" className="wd-pick" aria-pressed={o.entity === linked} onClick={() => onPick(o.entity)}>
              <Icon size={18} aria-hidden />
              <span>
                <b>{o.name}</b>
                <small>{o.kindLabel}</small>
              </span>
              <em>{o.words}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}
