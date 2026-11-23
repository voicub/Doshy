import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { siteOf, type Site, type SiteData } from "@/lib/siteTypes";
import type { SitePhoto } from "@/lib/sitePhoto";
import { useSiteState } from "@/lib/siteStore";

export type SurroundingsInput = { site: Site; data: SiteData; photo: SitePhoto | undefined };

/**
 * The surroundings to draw, or null: only in the garden, only when the owner switched them on and the data has arrived
 * (data kept from an earlier fetch stays on screen while a refresh runs). The satellite photo only counts when its layer is on.
 */
export function useSurroundings(): SurroundingsInput | null {
  const raw = useStore((s) => s.plan.site);
  const garden = useStore((s) => s.environment === "garden");
  const site = useMemo(() => siteOf(raw), [raw]);
  const data = useSiteState((s) => s.data);
  const photo = useSiteState((s) => s.photo);
  return useMemo(() => (garden && site.enabled && data ? { site, data, photo: site.layers.satellite ? photo : undefined } : null), [garden, site, data, photo]);
}
