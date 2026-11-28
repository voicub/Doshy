// Browser side of the night sky: where the home is, and what the sky looks like there for the date the 3D view and the chart show. One reading per change, shared by the dome in
// the scene and the Tonight's sky chart.
import { useMemo } from "react";
import { DEFAULT_PLACE, type Place } from "./daylight";
import { siteCenter } from "./geo";
import { bodiesAt, limitingMagnitude, type SkyBody } from "./nightsky";
import { equatorialToScene, type Mat3 } from "./nightskyFrame";
import { siteOf } from "./siteTypes";
import { useStore } from "./store";
import { useSky } from "./useSky";

/** Where the home is: the plan's Site (manual coordinates or Home Assistant's home), else the same default the real sky uses. Stable while the numbers stand. */
export function useHomePlace(): Place {
  const rawSite = useStore((s) => s.plan.site);
  const homeLat = useStore((s) => s.states["zone.home"]?.attributes?.latitude); // the two numbers, not the whole states object: it is replaced on every poll
  const homeLon = useStore((s) => s.states["zone.home"]?.attributes?.longitude);
  const found = useMemo(() => siteCenter(siteOf(rawSite), { "zone.home": { attributes: { latitude: homeLat, longitude: homeLon } } }), [rawSite, homeLat, homeLon]);
  const lat = found?.lat ?? DEFAULT_PLACE.lat;
  const lon = found?.lon ?? DEFAULT_PLACE.lon;
  return useMemo(() => ({ lat, lon }), [lat, lon]);
}

export type NightSkyFrame = {
  date: Date;
  place: Place;
  bearing: number;
  /** The brightest-first prefix of the catalogue that is visible has magnitude below this; below about -1.5 it is day and nothing is drawn. */
  limit: number;
  /** J2000 equatorial -> scene direction (see lib/nightskyFrame.ts). */
  matrix: Mat3;
  sun: SkyBody | undefined;
  moon: SkyBody | undefined;
  /** 0..1 lit share of the Moon (the sky's own reading: Home Assistant's moon sensor when there is one) */
  moonIllumination: number;
  planets: SkyBody[];
};

/** Below this limiting magnitude not even Venus is seen: daylight, so the sky draws nothing at all. */
export const DAY_LIMIT = -1.5;

/** The pure part of `useNightSky`: the sky for a date, a place, a plan bearing and what the weather and the moon do to the dark. `sunAlt` is the sun the scene shows (the real one, or a pinned preset's). */
export function nightSkyAt(date: Date, place: Place, bearing: number, cloud: number, moonIllumination: number, sunAlt?: number): NightSkyFrame {
  const bodies = bodiesAt(date, place.lat, place.lon);
  const sun = bodies.find((b) => b.id === "sun");
  const moon = bodies.find((b) => b.id === "moon");
  const limit = limitingMagnitude(sunAlt ?? sun?.alt ?? -90, moon?.alt ?? -90, moonIllumination, cloud);
  return { date, place, bearing, limit, matrix: equatorialToScene(date, place.lat, place.lon, bearing), sun, moon, moonIllumination, planets: bodies.filter((b) => b.id !== "sun" && b.id !== "moon") };
}

/** The sky the scene shows now (the previewed date included: useSky already follows "Preview a date"). Recomputed when the sky's own clock ticks (every 30 s), not on every frame. */
export function useNightSky(): NightSkyFrame {
  const sky = useSky();
  const place = useHomePlace();
  const bearing = useStore((s) => s.plan.bearing ?? 0);
  const { now, elevation } = sky;
  const cloud = sky.weather.cloud;
  const moonLit = sky.moon.illumination;
  return useMemo(() => nightSkyAt(now, place, bearing, cloud, moonLit, elevation), [now, place, bearing, cloud, moonLit, elevation]);
}
