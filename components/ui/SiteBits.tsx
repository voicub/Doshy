"use client";
import type { ReactNode } from "react";
import MonoLabel from "./MonoLabel";

/** A labelled on/off switch (a button, so Space and Enter work and a screen reader says "on" or "off"). */
export function Switch({ on, onChange, label, big, disabled }: { on: boolean; onChange: (on: boolean) => void; label: ReactNode; big?: boolean; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} className={`sp-switch ${big ? "big" : ""}`} onClick={() => onChange(!on)}>
      <span className="sp-switch-label">{label}</span>
      <i aria-hidden />
    </button>
  );
}

/** A titled block of the panel. `name` becomes the class `sp-b-<name>`, so compact screens can reorder the blocks (compactPanels.css). */
export const Block = ({ title, name, children }: { title: string; name?: string; children: ReactNode }) => (
  <section className={name ? `sp-block sp-b-${name}` : "sp-block"} aria-label={title}>
    <h2 className="sp-h"><MonoLabel>{title}</MonoLabel></h2>
    {children}
  </section>
);
