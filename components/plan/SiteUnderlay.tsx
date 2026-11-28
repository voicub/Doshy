"use client";
import { memo, useEffect, useMemo, useState } from "react";
import { siteToPlan } from "@/lib/geo";
import { isHostBuilding, planBuilding, planFootprint } from "@/lib/siteMesh";
import { siteOf, type SiteData, type SiteLayers, type XY } from "@/lib/siteTypes";
import type { SitePhoto } from "@/lib/sitePhoto";
import { useSiteState } from "@/lib/siteStore";
import { useStore } from "@/lib/store";
import { useSiteAlign } from "../ui/siteAlign";
import { LINE } from "./BlueprintPaper";

const ring = (pts: XY[]) => `M${pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join("L")}Z`;
const shape = (outer: XY[], holes?: XY[][]) => [outer, ...(holes ?? [])].map(ring).join("");
const line = (pts: XY[]) => `M${pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join("L")}`;
const HAIR = { vectorEffect: "non-scaling-stroke", strokeWidth: 1 } as const; // one screen pixel at any zoom, even inside the rotated group

/** The surroundings as faint blueprint lines: building outlines, roads, water and tree crowns, in site metres (the parent group places them). */
const Lines = memo(function Lines({ data, layers, hosts }: { data: SiteData; layers: SiteLayers; hosts: ReadonlySet<string> }) {
  return (
    <g fill="none" stroke={LINE}>
      {layers.water && data.areas.filter((a) => a.kind === "water").map((a) => <path key={a.id} d={shape(a.ring, a.holes)} fillRule="evenodd" fill="rgb(var(--accent-rgb) / 0.1)" stroke="rgb(var(--accent-rgb) / 0.45)" {...HAIR} />)}
      {data.roads.filter((r) => (r.kind === "river" ? layers.water : layers.roads)).map((r) => (
        <g key={r.id}>
          <path d={line(r.pts)} stroke={r.kind === "river" ? "rgb(var(--accent-rgb) / 0.1)" : "color-mix(in srgb, var(--plan-line) 7%, transparent)"} strokeWidth={Math.max(1, r.width)} strokeLinejoin="round" />
          <path d={line(r.pts)} strokeOpacity={0.3} strokeDasharray={r.kind === "footway" || r.kind === "track" ? "4 3" : undefined} {...HAIR} />
        </g>
      ))}
      {layers.trees && data.trees.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={Math.max(0.5, t.crown / 2)} fill="rgb(var(--ok-rgb) / 0.08)" stroke="rgb(var(--ok-rgb) / 0.5)" {...HAIR} />)}
      {layers.buildings && data.buildings.map((b) => <path key={b.id} d={shape(b.ring, b.holes)} fillRule="evenodd" fill={hosts.has(b.id) ? "none" : "color-mix(in srgb, var(--plan-line) 7%, transparent)"} strokeOpacity={hosts.has(b.id) ? 0.3 : 0.55} {...HAIR} />)}
    </g>
  );
});

/** The satellite canvas as an image address, made once per photo (the canvas itself is never redrawn while panning). */
function usePhotoUrl(photo: SitePhoto | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return setUrl(null);
    let alive = true;
    let made: string | null = null;
    photo.canvas.toBlob((b) => {
      if (!alive || !b) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    }, "image/jpeg", 0.9);
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [photo]);
  return url;
}

/**
 * What the Plan view draws under the blueprint paper when the surroundings are on: the satellite photo (faded) and the outlines of the neighbourhood.
 * Everything is placed by one transform, site metres -> plan metres (lib/geo.ts `siteToPlan`: shift by dx, dy, then turn by the plan's bearing),
 * so the photo is never resampled. It takes no pointer events: it can never get in the way of editing.
 */
export default memo(function SiteUnderlay() {
  const raw = useStore((s) => s.plan.site);
  const bearing = useStore((s) => s.plan.bearing ?? 0);
  const footKey = useStore((s) => {
    const r = planFootprint(s.plan);
    return r ? `${r.x0},${r.y0},${r.x1},${r.y1}` : "";
  });
  const site = useMemo(() => siteOf(raw), [raw]);
  const data = useSiteState((s) => s.data);
  // the blocks the 3D view leaves out (they hold the flat): only their outline is drawn here, as faint as the plan's own walls need
  const hosts = useMemo(() => {
    const ids = new Set<string>();
    if (!footKey || !data) return ids;
    const [x0, y0, x1, y1] = footKey.split(",").map(Number);
    const toPlan = (p: XY) => siteToPlan({ dx: site.dx, dy: site.dy }, bearing, p);
    const home = toPlan([0, 0]);
    for (const b of data.buildings) {
      const pb = planBuilding(b, toPlan);
      if (pb && isHostBuilding(pb, { x0, y0, x1, y1 }, [home])) ids.add(b.id);
    }
    return ids;
  }, [data, footKey, site.dx, site.dy, bearing]);
  const status = useSiteState((s) => s.status);
  const photo = useSiteState((s) => s.photo);
  const opacity = useSiteAlign((s) => s.opacity);
  const url = usePhotoUrl(site.enabled && site.layers.satellite ? photo : undefined);
  if (!site.enabled || (status !== "ready" && !data)) return null;
  const b = photo?.bounds;
  return (
    <g transform={`rotate(${-bearing}) translate(${-site.dx} ${-site.dy})`} pointerEvents="none">
      {url && b && <image href={url} x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} preserveAspectRatio="none" opacity={opacity} />}
      {data && <Lines data={data} layers={site.layers} hosts={hosts} />}
    </g>
  );
});
