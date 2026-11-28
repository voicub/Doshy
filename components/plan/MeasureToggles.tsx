"use client";
import { ArrowsHorizontalIcon, FrameCornersIcon } from "@phosphor-icons/react";
import { useMeasureSettings } from "./measureUi";
import "./measure.css";
import { ACCENT } from "./planStyle";

/**
 * The two switches that draw measurements on the plan without the Ruler: every wall's length (inside and outside face) and every room's area and the way round.
 * `corner` is the pair of small buttons next to Fit and Dimensions; `bar` is the same two as chips in the Measure bar.
 */
export default function MeasureToggles({ where }: { where: "corner" | "bar" }) {
  const lengths = useMeasureSettings((s) => s.wallLengths);
  const areas = useMeasureSettings((s) => s.roomAreas);
  const patch = useMeasureSettings((s) => s.patch);
  const items = [
    { on: lengths, flip: () => patch({ wallLengths: !lengths }), icon: <ArrowsHorizontalIcon size={14} />, short: "Lengths", label: "Show wall lengths", title: "Show the length of every wall, inside and outside" },
    { on: areas, flip: () => patch({ roomAreas: !areas }), icon: <FrameCornersIcon size={14} />, short: "Areas", label: "Show room areas", title: "Show every room's area and the way round it" },
  ];
  return items.map((i) =>
    where === "corner" ? (
      <button key={i.label} type="button" className="kbd mz-corner" onClick={i.flip} aria-pressed={i.on} aria-label={i.label} title={i.title} style={{ height: 26, gap: 6, background: "rgb(var(--lg-8-31-58) / 0.9)", cursor: "pointer", color: i.on ? ACCENT : undefined }}>
        {i.icon}
        <span className="mz-corner-text">{i.short}</span>
      </button>
    ) : (
      <button key={i.label} type="button" className="mz-chip" onClick={i.flip} aria-pressed={i.on} title={i.title}>
        {i.icon}
        {i.label}
      </button>
    ),
  );
}
