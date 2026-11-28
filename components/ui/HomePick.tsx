"use client";
import { HouseLineIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { homeName, MAIN_NAME, useHomes } from "@/lib/homes";
import MonoLabel from "./MonoLabel";
import "./homes.css";

/**
 * "Which Home Assistant does this plan show?" as a list of radios (native: arrows and Space work without code).
 * Nothing at all while there is no extra home: a single-home Doshy does not see it. `value` null = the Main home.
 */
export default function HomePick({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const homes = useHomes((s) => s.homes);
  const group = useId();
  if (homes.length === 0) return null;
  const choices: { id: string | null; name: string }[] = [{ id: null, name: MAIN_NAME }, ...homes.map((h) => ({ id: h.id, name: h.name }))];
  return (
    <fieldset className="hm-pick">
      <legend><MonoLabel>Home Assistant</MonoLabel></legend>
      {choices.map((c) => (
        <label key={c.id ?? "main"} className="hm-choice">
          <input type="radio" name={group} checked={value === c.id} onChange={() => onChange(c.id)} />
          <span>{c.name}</span>
        </label>
      ))}
      <p className="hint">The devices, states, history and scenes of this plan come from this Home Assistant.</p>
    </fieldset>
  );
}

/** The name of a plan's home as a small mono label, for a plan on an extra home only (`id` null = the Main home: nothing). */
export function HomeTag({ id }: { id: string | null }) {
  const name = useHomes((s) => (id === null ? null : homeName(id, s)));
  if (name === null) return null;
  return (
    <span className="hm-tag" title={`Home Assistant: ${name}`}>
      <HouseLineIcon size={12} aria-hidden />
      <span>{name}</span>
    </span>
  );
}
