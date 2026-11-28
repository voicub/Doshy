"use client";
import { describeBuildings, describeTerrain } from "@/lib/siteExternal";
import { useSiteState } from "@/lib/siteStore";
import type { Site } from "@/lib/siteTypes";
import { useStore } from "@/lib/store";
import { Block } from "./SiteBits";
import "./siteData.css";

const GROUND: { value: Site["terrainFrom"] | "auto"; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "the best there is" },
  { value: "standard", label: "Standard", hint: "90 m model" },
  { value: "high", label: "High", hint: "3 to 6 m" },
];
const SCALES = [1, 1.5, 2, 3] as const;
const SMOOTHS: { value: 0 | 1 | 2; label: string }[] = [
  { value: 0, label: "None" },
  { value: 1, label: "Light" },
  { value: 2, label: "Strong" },
];
const BUILDINGS: { value: NonNullable<Site["buildingData"]> | "both"; label: string; hint: string }[] = [
  { value: "osm", label: "OpenStreetMap", hint: "map volunteers" },
  { value: "overture", label: "Overture Maps", hint: "more heights" },
  { value: "both", label: "Both", hint: "best" },
];

/** How detailed the real ground is: where it comes from, and how steep and smooth it looks. Only with the ground layer on. */
export function GroundBlock({ site }: { site: Site }) {
  const setSite = useStore((s) => s.setSite);
  const info = useSiteState((s) => s.terrainInfo);
  if (!site.layers.terrain) return null;
  const from = site.terrainFrom ?? "auto";
  const detailed = from !== "standard";
  const sentence = describeTerrain(info);
  return (
    <Block title="Ground detail" name="ground">
      <div className="seg sp-seg sp-seg3" role="group" aria-label="Where the ground height comes from">
        {GROUND.map((g) => (
          <button key={g.value} type="button" aria-pressed={from === g.value} onClick={() => setSite({ terrainFrom: g.value === "auto" ? undefined : g.value })}>
            {g.label}<small>{g.hint}</small>
          </button>
        ))}
      </div>
      {sentence && <p className="sp-status" role="status">{sentence}</p>}
      <p className="field-note">The detailed ground comes from AWS Terrain Tiles, a free public data set (the server downloads small map pictures of the height of the land). If they cannot be loaded, the standard ground is used.</p>
      {detailed && (
        <>
          <p className="sp-sub">Hills look</p>
          <div className="sp-chips sp-chips4" role="group" aria-label="How much steeper than real the hills are drawn">
            {SCALES.map((v) => (
              <button key={v} type="button" className="sp-chip" aria-pressed={(site.terrainScale ?? 1) === v} onClick={() => setSite({ terrainScale: v })}>{v}x</button>
            ))}
          </div>
          <p className="sp-sub">Smooth the ground</p>
          <div className="sp-chips sp-chips3" role="group" aria-label="Smoothing of the detailed ground">
            {SMOOTHS.map((v) => (
              <button key={v.value} type="button" className="sp-chip" aria-pressed={(site.terrainSmooth ?? 0) === v.value} onClick={() => setSite({ terrainSmooth: v.value === 0 ? undefined : v.value })}>{v.label}</button>
            ))}
          </div>
          <p className="field-note">1x is the real shape. Higher values exaggerate the hills; smoothing takes away small bumps from walls and roofs the survey picked up. Your own flat always stays level.</p>
        </>
      )}
    </Block>
  );
}

/** Which map data the neighbouring buildings come from. Only with the buildings layer on and not the city model. */
export function BuildingsBlock({ site }: { site: Site }) {
  const setSite = useStore((s) => s.setSite);
  const info = useSiteState((s) => s.buildingInfo);
  if (!site.layers.buildings || site.buildingsFrom === "city") return null;
  const choice = site.buildingData ?? "both";
  const sentence = describeBuildings(info);
  return (
    <Block title="Buildings from" name="bldg">
      <div className="seg sp-seg sp-seg3" role="group" aria-label="Where the neighbouring buildings come from">
        {BUILDINGS.map((b) => (
          <button key={b.value} type="button" aria-pressed={choice === b.value} onClick={() => setSite({ buildingData: b.value === "both" ? undefined : b.value })}>
            {b.label}<small>{b.hint}</small>
          </button>
        ))}
      </div>
      {sentence && <p className={info?.state === "unavailable" ? "sp-status bad" : "sp-status"} role="status">{sentence}</p>}
      <p className="field-note">Overture Maps is a free public map that adds many measured building heights (and some buildings OpenStreetMap lacks). Both: the best of the two.</p>
    </Block>
  );
}
