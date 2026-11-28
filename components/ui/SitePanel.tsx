"use client";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { planBounds } from "@/lib/geometry";
import { useSiteState } from "@/lib/siteStore";
import { siteOf, type SiteLayers } from "@/lib/siteTypes";
import { creditsOf, enablePatch, siteSummary } from "@/lib/siteUi";
import { useStore } from "@/lib/store";
import { useVp } from "@/lib/useVp";
import HudPanel from "./HudPanel";
import SiteAlignControls from "./SiteAlignControls";
import CityBlock from "./SiteCityBlock";
import { LayersBlock, RadiusBlock } from "./SiteBlocks";
import { BuildingsBlock, GroundBlock } from "./SiteDataBlocks";
import { Block, Switch } from "./SiteBits";
import SitePlace from "./SitePlace";
import { useSiteAlign } from "./siteAlign";
import "./sitePanel.css";
import "./compactPanels.css";

/** What is happening with the data, in plain words. */
function Status({ layers, fromCity }: { layers: SiteLayers; fromCity: boolean }) {
  const status = useSiteState((s) => s.status);
  const data = useSiteState((s) => s.data);
  const error = useSiteState((s) => s.error);
  const refresh = useSiteState((s) => s.refresh);
  return (
    <Block title="Status" name="status">
      {status === "error" ? (
        <p className="sp-status bad" role="alert">{error || "The surroundings could not be loaded."}</p>
      ) : status === "ready" && data ? (
        <p className="sp-status" role="status">{siteSummary(data, layers, fromCity)}.<small>Loaded {new Date(data.fetchedAt).toLocaleString()}.</small></p>
      ) : (
        <p className="sp-status" role="status">Loading the surroundings...</p>
      )}
      {status === "ready" && data?.notes.map((n) => <p key={n} className="field-note">{n}</p>)}
      <button type="button" className="btn sp-wide" disabled={status === "loading"} onClick={() => void refresh(true)}>
        <ArrowsClockwiseIcon size={16} aria-hidden /> Refresh data
      </button>
    </Block>
  );
}

/** "Surroundings": show the real neighbourhood (buildings, trees, roads, water, ground height, satellite photo) around the home, and line it up with the plan. */
export default function SitePanel({ onClose }: { onClose: () => void }) {
  const raw = useStore((s) => s.plan.site);
  const site = useMemo(() => siteOf(raw), [raw]);
  const bearing = useStore((s) => s.plan.bearing ?? 0);
  const setSite = useStore((s) => s.setSite);
  const data = useSiteState((s) => s.data);
  const [placed, setPlaced] = useState(false); // the first switch-on moved the plan's middle onto the home location
  useEffect(() => () => useSiteAlign.getState().setAlign(false), []); // closing the panel ends "drag the map"
  const credits = creditsOf(data?.attribution, site.layers.satellite, site.buildingsFrom === "city");
  // compact screens: "Line it up on the plan" hides the panel (the map must stay visible); the on-canvas bar brings it back or closes it for good
  const aligning = useSiteAlign((s) => s.align);
  const hidden = useVp().vp !== "regular" && aligning;
  useEffect(() => {
    if (!hidden) return;
    useSiteAlign.setState({ leave: onClose });
    return () => useSiteAlign.setState({ leave: null });
  }, [hidden, onClose]);
  if (hidden) return null;

  return (
    <HudPanel title="Surroundings" onClose={onClose} className="drawer sp">
      <div className="sp-body">
        {site.enabled ? (
          <details className="sp-what">
            <summary>What this does</summary>
            <p className="hint">Draws the real neighbourhood around your home from public map data: nearby buildings, trees, roads, water and the shape of the ground.</p>
          </details>
        ) : (
          <p className="hint">Draws the real neighbourhood around your home from public map data: nearby buildings, trees, roads, water and the shape of the ground. You see it behind your plan and in Live mode.</p>
        )}
        <Switch
          big
          on={site.enabled}
          label="Show the real surroundings of my home"
          onChange={(enabled) => {
            if (!enabled) return setSite({ enabled });
            const { patch, centred } = enablePatch(site, bearing, planBounds(useStore.getState().plan));
            setSite(patch);
            setPlaced(centred);
          }}
        />
        {!site.enabled && <p className="field-note">Only the coordinates of your home, rounded, are sent (through this app's server) to OpenStreetMap, Open-Meteo, AWS Terrain Tiles and Overture Maps (the last two can be switched off for the whole server with DOSHY_EXTERNAL_DATA=0). Every change here can be undone.</p>}

        {site.enabled && (
          <>
            <Status layers={site.layers} fromCity={site.buildingsFrom === "city"} />
            {placed && <p className="field-note">The middle of your plan was placed on your home location. Use the arrows or Drag the map to line it up with the real building.</p>}
            <SitePlace site={site} />

            <RadiusBlock site={site} />
            <LayersBlock site={site} />
            <CityBlock site={site} />
            <BuildingsBlock site={site} />
            <GroundBlock site={site} />

            <SiteAlignControls site={site} bearing={bearing} />

            <ul className="sp-credits" aria-label="Data credits">
              {credits.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </>
        )}
      </div>
    </HudPanel>
  );
}
