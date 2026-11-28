"use client";
import { pressureOptions, stateText } from "@/lib/entitySuggest";
import type { HAState } from "@/lib/ha";
import { useStore } from "@/lib/store";
import MonoLabel from "./MonoLabel";

export default function PressureLinkGroup({ value, domains, filter, onPick }: { value?: string; domains: readonly string[]; filter?: (st: HAState) => boolean; onPick: (id: string) => void }) {
  const states = useStore((s) => s.states);
  const options = pressureOptions(states).filter((s) => domains.includes(s.entity_id.split(".")[0]) && (!filter || filter(s)));
  if (!options.length) return null;
  return <div className="field wd-group" role="group" aria-label="Pressure sensors">
    <MonoLabel>Pressure sensors</MonoLabel>
    <div className="wd-list">{options.map((s) => <button type="button" className="btn" key={s.entity_id} aria-pressed={s.entity_id === value} onClick={() => onPick(s.entity_id)}>{s.attributes.friendly_name ?? s.entity_id} · {stateText(s)}</button>)}</div>
  </div>;
}
