"use client";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { washdataOf, washProvides, washView, wordsOf } from "@/lib/washdata";
import MonoLabel from "../ui/MonoLabel";
import "../ui/washData.css";

/** "WashData: Washing Machine", its state now, what linking it gives (little chips), and whether to say so when a cycle finishes (item.params.washNotify, on unless switched off). */
export default function WashLine({ item }: { item: Item }) {
  const states = useStore((s) => s.states);
  const patch = useStore((s) => s.patch);
  const dev = washdataOf(states, item.entity);
  if (!dev) return null;
  const v = washView(states, dev.base);
  const notify = item.params?.washNotify !== false;
  const setNotify = (on: boolean) => {
    const params = { ...Object.fromEntries(Object.entries(item.params ?? {}).filter(([k]) => k !== "washNotify")), ...(on ? {} : { washNotify: false }) };
    patch("item", item.id, { params: Object.keys(params).length ? params : undefined });
  };
  return (
    <div className="field wd-line" role="group" aria-label="WashData">
      <MonoLabel>WashData</MonoLabel>
      <b>WashData: {dev.name}</b>
      <small>{wordsOf(v)}{v.progress !== undefined && v.phase === "running" ? `, ${Math.round(v.progress)}%` : ""}</small>
      <ul className="wd-chips" aria-label="What it shows">
        {washProvides(dev).map((p) => <li key={p} className="on">{p}</li>)}
      </ul>
      <button type="button" role="switch" aria-checked={notify} className="wd-switch" onClick={() => setNotify(!notify)}>
        <i />
        <span>Tell me when it finishes</span>
      </button>
      <small className="field-note">Tap the appliance in Live view for its card. The dashboard never starts a cycle.</small>
    </div>
  );
}
