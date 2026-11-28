// The "Sunlight in this room" preview's shared state. While the panel is open (`active`) the 3D scene's sun follows `sun` instead of the live sky (usePreviewSky, one seam in
// components/scene/SkyDriver.tsx); the HUD keeps reading the real sky from lib/useSky.ts. The panel also publishes the room's sun-hours result here for the two floor overlays
// (components/scene/SunHeat.tsx in 3D, components/plan/DaylightOverlay.tsx in the plan). Per-session: nothing is persisted.
import { useMemo } from "react";
import { create } from "zustand";
import { DEFAULT_PLACE, todayOf, type Place, type Sun } from "./daylight";
import type { DayResult, HeatMode } from "./daylightRun";
import { daylightOf, phaseOf, type SkyState } from "./sky";

type PreviewData = {
  active: boolean;
  year: number;
  /** 1..365 */
  doy: number;
  /** clock hours, 0..24 (fractional) */
  hour: number;
  playing: boolean;
  /** the sun at that date and time, written by the panel (which knows the place and the clock's offset) */
  sun: Sun | null;
  /** typed coordinates for a home with no location of its own (neither the plan's Surroundings nor Home Assistant's home) */
  place: Place;
  /** paint the room's sun hours on the floor, and which of the two pictures */
  heat: boolean;
  mode: HeatMode;
  /** the analysed room's result, its storey (for the level views) and the cells in sun at the preview time (null while there is no result or the sun is down) */
  result: DayResult | null;
  levelId: string | null;
  lit: Uint8Array | null;
};

type Preview = PreviewData & {
  open: () => void;
  close: () => void;
  patch: (p: Partial<PreviewData>) => void;
};

const IDLE: PreviewData = { active: false, year: 2000, doy: 1, hour: 12, playing: false, sun: null, place: DEFAULT_PLACE, heat: true, mode: "hours", result: null, levelId: null, lit: null };

export const useDaylightPreview = create<Preview>()((set) => ({
  ...IDLE,
  // opens on the real date and time; the typed place and the overlay choice survive a close
  open: () => set((s) => ({ ...IDLE, ...todayOf(new Date()), active: true, place: s.place, heat: s.heat, mode: s.mode })),
  close: () => set((s) => ({ ...IDLE, place: s.place, heat: s.heat, mode: s.mode })),
  patch: (p) => set(p),
}));

/** The live sky with the previewed sun swapped in (elevation, azimuth, daylight, phase); weather, moon and the rest stay real. The same object comes back while nothing changes. */
export function usePreviewSky(sky: SkyState): SkyState {
  const sun = useDaylightPreview((s) => (s.active ? s.sun : null));
  return useMemo(() => {
    if (!sun) return sky;
    const daylight = daylightOf(sun.elevation);
    return { ...sky, elevation: sun.elevation, azimuth: sun.azimuth, daylight, phase: phaseOf(daylight) };
  }, [sky, sun]);
}
