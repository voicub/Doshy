"use client";
import { BuildingsIcon, ImageIcon, MountainsIcon, RoadHorizonIcon, TreeIcon, WavesIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { DEFAULT_SITE, SITE_RADIUS, type Site, type SiteLayers } from "@/lib/siteTypes";
import { RADIUS_STEPS, clampRadius } from "@/lib/siteUi";
import { useStore } from "@/lib/store";
import NumField from "./NumField";
import { Block } from "./SiteBits";

const LAYERS: { key: keyof SiteLayers; label: string; icon: ReactNode }[] = [
  { key: "buildings", label: "Buildings", icon: <BuildingsIcon size={16} aria-hidden /> },
  { key: "trees", label: "Trees", icon: <TreeIcon size={16} aria-hidden /> },
  { key: "roads", label: "Roads", icon: <RoadHorizonIcon size={16} aria-hidden /> },
  { key: "water", label: "Water", icon: <WavesIcon size={16} aria-hidden /> },
  { key: "terrain", label: "Ground height", icon: <MountainsIcon size={16} aria-hidden /> },
  { key: "satellite", label: "Satellite photo", icon: <ImageIcon size={16} aria-hidden /> },
];

/** How far around the home the surroundings are drawn: three steps, or an exact distance. */
export function RadiusBlock({ site }: { site: Site }) {
  const setSite = useStore((s) => s.setSite);
  return (
    <Block title="How far" name="far">
      <div className="seg sp-seg" role="group" aria-label="How much of the surroundings to draw">
        {RADIUS_STEPS.map((r) => (
          <button key={r.m} type="button" aria-pressed={site.radius === r.m} onClick={() => setSite({ radius: r.m })}>
            {r.label}<small>{r.m} m</small>
          </button>
        ))}
      </div>
      <details className="sp-adv">
        <summary>Advanced: exact distance</summary>
        <NumField label="Distance" unit="m" value={site.radius} min={SITE_RADIUS.min} max={SITE_RADIUS.max} step={10} live={false} onChange={(m) => setSite({ radius: clampRadius(m) })} />
      </details>
    </Block>
  );
}

/** Which map layers to draw. */
export function LayersBlock({ site }: { site: Site }) {
  const setSite = useStore((s) => s.setSite);
  return (
    <Block title="What to show" name="show">
      <div className="sp-chips" role="group" aria-label="Layers">
        {LAYERS.map((l) => (
          <button key={l.key} type="button" className="sp-chip" aria-pressed={site.layers[l.key]} onClick={() => setSite({ layers: { [l.key]: !site.layers[l.key] } })}>
            {l.icon}
            {l.label}
          </button>
        ))}
      </div>
      <p className="field-note">Satellite photo: loads photos from a third-party map service (Esri by default). Off unless you turn it on.</p>
      {!site.layers.satellite && site.layers.trees && <p className="field-note">Trees in the satellite photo are found only when the photo is on. Without it you see the trees that map volunteers have added.</p>}
      <button type="button" className="btn sp-wide" disabled={JSON.stringify(site.layers) === JSON.stringify(DEFAULT_SITE.layers)} onClick={() => setSite({ layers: DEFAULT_SITE.layers })}>Back to the usual layers</button>
    </Block>
  );
}
