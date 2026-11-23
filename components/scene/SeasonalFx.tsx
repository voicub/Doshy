"use client";
import { outOfSeason } from "@/lib/catalog.seasonal";
import { useSkySettings } from "@/lib/sky";
import { useNow } from "../useNow";

const RECHECK_MS = 10 * 60_000; // a dashboard left on all night still swaps over when the holiday window ends

/** True when a piece that opted in (`params.seasonal`) should be hidden because its holiday is not on. Pass `enabled` false to skip the work. */
export function useOutOfSeason(kind: string, enabled: boolean): boolean {
  const rite = useSkySettings((s) => s.easterRite);
  const forced = useSkySettings((s) => s.holidayMode);
  const now = useNow(RECHECK_MS, enabled);
  return enabled && outOfSeason(kind, new Date(now), rite, forced);
}
