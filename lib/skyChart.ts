// The geometry of the "Tonight's sky" chart: a round map of the whole sky with the point straight overhead (the zenith) in the middle and the horizon on the rim.
// Pure: the node test runner loads this file directly.

/** A chart is the view from underneath the sky, so east is on the LEFT when north is at the top (the way a planisphere is drawn). */
export type ChartPoint = { x: number; y: number };

/** Southern homes face the sun at noon to the north and the Southern Cross to the south, so their chart has south at the top: the same view turned half a round. */
export const southUp = (latDeg: number): boolean => latDeg < 0;

/** A place in the sky (degrees; azimuth clockwise from north) on a chart of radius 1 centred on 0, 0 (y grows downward, as on a screen). Below the horizon lands outside the rim. */
export function chartPoint(altDeg: number, azDeg: number, flip: boolean): ChartPoint {
  const r = (90 - altDeg) / 90;
  const a = (azDeg * Math.PI) / 180;
  const s = flip ? 1 : -1;
  return { x: s * r * Math.sin(a), y: s * r * Math.cos(a) };
}

/** Where N, E, S and W are on the rim of a chart of radius 1. */
export const compassPoints = (flip: boolean): { label: "N" | "E" | "S" | "W"; at: ChartPoint }[] =>
  ([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).map(([label, az]) => ({ label, at: chartPoint(0, az, flip) }));

const WORDS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;
/** "south-west" for an azimuth: how the list says where to look. */
export const directionWord = (azDeg: number): string => WORDS[Math.round((((azDeg % 360) + 360) % 360) / 45) % 8];

/** "Look high in the south-east" / "low in the west": how high a thing is, in words. */
export const heightWord = (altDeg: number): string => (altDeg >= 60 ? "very high" : altDeg >= 35 ? "high" : altDeg >= 15 ? "halfway up" : "low");
